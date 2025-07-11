;; Maintenance Service Contract
;; Manages handle repair and bristle restoration

;; Constants
(define-constant CONTRACT_OWNER tx-sender)
(define-constant ERR_UNAUTHORIZED (err u500))
(define-constant ERR_BROOM_NOT_FOUND (err u501))
(define-constant ERR_SERVICE_NOT_FOUND (err u502))
(define-constant ERR_PROVIDER_NOT_FOUND (err u503))
(define-constant ERR_INVALID_RATING (err u504))
(define-constant ERR_SERVICE_IN_PROGRESS (err u505))

;; Data Variables
(define-data-var next-service-id uint u1)
(define-data-var next-provider-id uint u1)

;; Data Maps
(define-map service-providers
  { provider-id: uint }
  {
    provider: principal,
    name: (string-ascii 50),
    specialties: (list 5 (string-ascii 30)),
    rating: uint,
    total-services: uint,
    active: bool,
    hourly-rate: uint,
    location: (string-ascii 100)
  }
)

(define-map maintenance-services
  { service-id: uint }
  {
    broom-id: uint,
    provider-id: uint,
    service-type: (string-ascii 30),
    description: (string-ascii 200),
    status: (string-ascii 20), ;; "requested", "in-progress", "completed", "cancelled"
    cost-estimate: uint,
    actual-cost: uint,
    start-date: uint,
    completion-date: uint,
    requester: principal
  }
)

(define-map service-history
  { broom-id: uint, service-id: uint }
  {
    service-date: uint,
    service-type: (string-ascii 30),
    provider-id: uint,
    cost: uint,
    rating: uint,
    notes: (string-ascii 200)
  }
)

(define-map broom-maintenance-schedule
  { broom-id: uint }
  {
    last-service-date: uint,
    next-service-due: uint,
    service-frequency: uint, ;; blocks between services
    maintenance-level: (string-ascii 20), ;; "basic", "standard", "premium"
    auto-schedule: bool
  }
)

(define-map provider-ratings
  { provider-id: uint, rater: principal }
  {
    rating: uint,
    service-id: uint,
    comments: (string-ascii 200),
    date: uint
  }
)

;; Public Functions

;; Register as service provider
(define-public (register-service-provider
  (name (string-ascii 50))
  (specialties (list 5 (string-ascii 30)))
  (hourly-rate uint)
  (location (string-ascii 100)))

  (let ((provider-id (var-get next-provider-id)))
    (map-set service-providers
      { provider-id: provider-id }
      {
        provider: tx-sender,
        name: name,
        specialties: specialties,
        rating: u100, ;; Start with perfect rating
        total-services: u0,
        active: true,
        hourly-rate: hourly-rate,
        location: location
      }
    )

    (var-set next-provider-id (+ provider-id u1))
    (ok provider-id)
  )
)

;; Request maintenance service
(define-public (request-maintenance
  (broom-id uint)
  (provider-id uint)
  (service-type (string-ascii 30))
  (description (string-ascii 200)))

  (let ((service-id (var-get next-service-id))
        (provider (unwrap! (map-get? service-providers { provider-id: provider-id }) ERR_PROVIDER_NOT_FOUND)))

    (asserts! (get active provider) ERR_PROVIDER_NOT_FOUND)

    (map-set maintenance-services
      { service-id: service-id }
      {
        broom-id: broom-id,
        provider-id: provider-id,
        service-type: service-type,
        description: description,
        status: "requested",
        cost-estimate: u0,
        actual-cost: u0,
        start-date: u0,
        completion-date: u0,
        requester: tx-sender
      }
    )

    (var-set next-service-id (+ service-id u1))
    (ok service-id)
  )
)

;; Accept service request (by provider)
(define-public (accept-service-request (service-id uint) (cost-estimate uint))
  (let ((service (unwrap! (map-get? maintenance-services { service-id: service-id }) ERR_SERVICE_NOT_FOUND))
        (provider (unwrap! (map-get? service-providers { provider-id: (get provider-id service) }) ERR_PROVIDER_NOT_FOUND)))

    (asserts! (is-eq tx-sender (get provider provider)) ERR_UNAUTHORIZED)
    (asserts! (is-eq (get status service) "requested") ERR_SERVICE_IN_PROGRESS)

    (map-set maintenance-services
      { service-id: service-id }
      (merge service {
        status: "in-progress",
        cost-estimate: cost-estimate,
        start-date: block-height
      })
    )

    (ok true)
  )
)

;; Complete service
(define-public (complete-service (service-id uint) (actual-cost uint) (notes (string-ascii 200)))
  (let ((service (unwrap! (map-get? maintenance-services { service-id: service-id }) ERR_SERVICE_NOT_FOUND))
        (provider (unwrap! (map-get? service-providers { provider-id: (get provider-id service) }) ERR_PROVIDER_NOT_FOUND)))

    (asserts! (is-eq tx-sender (get provider provider)) ERR_UNAUTHORIZED)
    (asserts! (is-eq (get status service) "in-progress") ERR_UNAUTHORIZED)

    ;; Update service record
    (map-set maintenance-services
      { service-id: service-id }
      (merge service {
        status: "completed",
        actual-cost: actual-cost,
        completion-date: block-height
      })
    )

    ;; Add to service history
    (map-set service-history
      { broom-id: (get broom-id service), service-id: service-id }
      {
        service-date: block-height,
        service-type: (get service-type service),
        provider-id: (get provider-id service),
        cost: actual-cost,
        rating: u0, ;; Will be updated when rated
        notes: notes
      }
    )

    ;; Update provider stats
    (map-set service-providers
      { provider-id: (get provider-id service) }
      (merge provider { total-services: (+ (get total-services provider) u1) })
    )

    ;; Update maintenance schedule
    (update-maintenance-schedule (get broom-id service))

    (ok true)
  )
)

;; Rate service provider
(define-public (rate-service (service-id uint) (rating uint) (comments (string-ascii 200)))
  (let ((service (unwrap! (map-get? maintenance-services { service-id: service-id }) ERR_SERVICE_NOT_FOUND)))
    (asserts! (is-eq tx-sender (get requester service)) ERR_UNAUTHORIZED)
    (asserts! (is-eq (get status service) "completed") ERR_UNAUTHORIZED)
    (asserts! (and (>= rating u1) (<= rating u5)) ERR_INVALID_RATING)

    ;; Record the rating
    (map-set provider-ratings
      { provider-id: (get provider-id service), rater: tx-sender }
      {
        rating: rating,
        service-id: service-id,
        comments: comments,
        date: block-height
      }
    )

    ;; Update service history with rating
    (match (map-get? service-history { broom-id: (get broom-id service), service-id: service-id })
      history-record
        (map-set service-history
          { broom-id: (get broom-id service), service-id: service-id }
          (merge history-record { rating: rating })
        )
      false
    )

    ;; Update provider's average rating
    (update-provider-rating (get provider-id service) rating)

    (ok true)
  )
)

;; Set maintenance schedule
(define-public (set-maintenance-schedule
  (broom-id uint)
  (service-frequency uint)
  (maintenance-level (string-ascii 20))
  (auto-schedule bool))

  (begin
    (map-set broom-maintenance-schedule
      { broom-id: broom-id }
      {
        last-service-date: block-height,
        next-service-due: (+ block-height service-frequency),
        service-frequency: service-frequency,
        maintenance-level: maintenance-level,
        auto-schedule: auto-schedule
      }
    )
    (ok true)
  )
)

;; Read-only Functions

;; Get service provider details
(define-read-only (get-service-provider (provider-id uint))
  (map-get? service-providers { provider-id: provider-id })
)

;; Get maintenance service details
(define-read-only (get-maintenance-service (service-id uint))
  (map-get? maintenance-services { service-id: service-id })
)

;; Get service history for broom
(define-read-only (get-service-history (broom-id uint) (service-id uint))
  (map-get? service-history { broom-id: broom-id, service-id: service-id })
)

;; Get maintenance schedule
(define-read-only (get-maintenance-schedule (broom-id uint))
  (map-get? broom-maintenance-schedule { broom-id: broom-id })
)

;; Check if maintenance is due
(define-read-only (is-maintenance-due (broom-id uint))
  (match (map-get? broom-maintenance-schedule { broom-id: broom-id })
    schedule
      (>= block-height (get next-service-due schedule))
    false
  )
)

;; Get provider rating
(define-read-only (get-provider-rating (provider-id uint) (rater principal))
  (map-get? provider-ratings { provider-id: provider-id, rater: rater })
)

;; Private Functions

;; Update maintenance schedule after service
(define-private (update-maintenance-schedule (broom-id uint))
  (match (map-get? broom-maintenance-schedule { broom-id: broom-id })
    schedule
      (map-set broom-maintenance-schedule
        { broom-id: broom-id }
        (merge schedule {
          last-service-date: block-height,
          next-service-due: (+ block-height (get service-frequency schedule))
        })
      )
    ;; Create default schedule if none exists
    (map-set broom-maintenance-schedule
      { broom-id: broom-id }
      {
        last-service-date: block-height,
        next-service-due: (+ block-height u1000), ;; Default 1000 blocks
        service-frequency: u1000,
        maintenance-level: "standard",
        auto-schedule: false
      }
    )
  )
)

;; Update provider's average rating
(define-private (update-provider-rating (provider-id uint) (new-rating uint))
  (match (map-get? service-providers { provider-id: provider-id })
    provider-data
      (let ((current-rating (get rating provider-data))
            (total-services (get total-services provider-data))
            (new-average (if (> total-services u0)
                          (/ (+ (* current-rating (- total-services u1)) new-rating) total-services)
                          new-rating)))

        (map-set service-providers
          { provider-id: provider-id }
          (merge provider-data { rating: new-average })
        )
      )
    false
  )
)
