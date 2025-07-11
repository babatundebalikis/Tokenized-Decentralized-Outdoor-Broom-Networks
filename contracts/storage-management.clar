;; Storage Management Contract
;; Handles seasonal broom protection and organization

;; Constants
(define-constant CONTRACT_OWNER tx-sender)
(define-constant ERR_UNAUTHORIZED (err u300))
(define-constant ERR_STORAGE_NOT_FOUND (err u301))
(define-constant ERR_BROOM_NOT_FOUND (err u302))
(define-constant ERR_STORAGE_FULL (err u303))
(define-constant ERR_INVALID_CAPACITY (err u304))
(define-constant ERR_ALREADY_STORED (err u305))

;; Data Variables
(define-data-var next-storage-id uint u1)

;; Data Maps
(define-map storage-locations
  { storage-id: uint }
  {
    owner: principal,
    location-name: (string-ascii 50),
    capacity: uint,
    current-occupancy: uint,
    climate-controlled: bool,
    security-level: uint, ;; 1-5 scale
    seasonal-protection: bool,
    coordinates: { lat: int, lng: int }
  }
)

(define-map broom-storage
  { broom-id: uint }
  {
    storage-id: uint,
    stored-date: uint,
    expected-retrieval: uint,
    storage-condition: (string-ascii 20),
    protection-level: uint,
    seasonal-storage: bool
  }
)

(define-map storage-conditions
  { storage-id: uint, date: uint }
  {
    temperature: int,
    humidity: uint,
    security-check: bool,
    maintenance-status: (string-ascii 30),
    inspector: principal
  }
)

(define-map seasonal-schedules
  { storage-id: uint, season: (string-ascii 10) }
  {
    start-block: uint,
    end-block: uint,
    protection-protocols: (string-ascii 100),
    maintenance-frequency: uint
  }
)

;; Public Functions

;; Register a new storage location
(define-public (register-storage-location
  (location-name (string-ascii 50))
  (capacity uint)
  (climate-controlled bool)
  (security-level uint)
  (seasonal-protection bool)
  (lat int)
  (lng int))

  (let ((storage-id (var-get next-storage-id)))
    (asserts! (> capacity u0) ERR_INVALID_CAPACITY)
    (asserts! (and (>= security-level u1) (<= security-level u5)) ERR_UNAUTHORIZED)

    (map-set storage-locations
      { storage-id: storage-id }
      {
        owner: tx-sender,
        location-name: location-name,
        capacity: capacity,
        current-occupancy: u0,
        climate-controlled: climate-controlled,
        security-level: security-level,
        seasonal-protection: seasonal-protection,
        coordinates: { lat: lat, lng: lng }
      }
    )

    (var-set next-storage-id (+ storage-id u1))
    (ok storage-id)
  )
)

;; Store a broom
(define-public (store-broom
  (broom-id uint)
  (storage-id uint)
  (expected-retrieval uint)
  (storage-condition (string-ascii 20))
  (seasonal-storage bool))

  (let ((storage-data (unwrap! (map-get? storage-locations { storage-id: storage-id }) ERR_STORAGE_NOT_FOUND)))
    (asserts! (is-none (map-get? broom-storage { broom-id: broom-id })) ERR_ALREADY_STORED)
    (asserts! (< (get current-occupancy storage-data) (get capacity storage-data)) ERR_STORAGE_FULL)

    ;; Store the broom
    (map-set broom-storage
      { broom-id: broom-id }
      {
        storage-id: storage-id,
        stored-date: block-height,
        expected-retrieval: expected-retrieval,
        storage-condition: storage-condition,
        protection-level: (get security-level storage-data),
        seasonal-storage: seasonal-storage
      }
    )

    ;; Update storage occupancy
    (map-set storage-locations
      { storage-id: storage-id }
      (merge storage-data { current-occupancy: (+ (get current-occupancy storage-data) u1) })
    )

    (ok true)
  )
)

;; Retrieve a broom from storage
(define-public (retrieve-broom (broom-id uint))
  (let ((storage-info (unwrap! (map-get? broom-storage { broom-id: broom-id }) ERR_BROOM_NOT_FOUND))
        (storage-data (unwrap! (map-get? storage-locations { storage-id: (get storage-id storage-info) }) ERR_STORAGE_NOT_FOUND)))

    ;; Remove broom from storage
    (map-delete broom-storage { broom-id: broom-id })

    ;; Update storage occupancy
    (map-set storage-locations
      { storage-id: (get storage-id storage-info) }
      (merge storage-data { current-occupancy: (- (get current-occupancy storage-data) u1) })
    )

    (ok true)
  )
)

;; Record storage conditions
(define-public (record-storage-conditions
  (storage-id uint)
  (temperature int)
  (humidity uint)
  (security-check bool)
  (maintenance-status (string-ascii 30)))

  (let ((storage-data (unwrap! (map-get? storage-locations { storage-id: storage-id }) ERR_STORAGE_NOT_FOUND)))
    (asserts! (is-eq tx-sender (get owner storage-data)) ERR_UNAUTHORIZED)

    (map-set storage-conditions
      { storage-id: storage-id, date: block-height }
      {
        temperature: temperature,
        humidity: humidity,
        security-check: security-check,
        maintenance-status: maintenance-status,
        inspector: tx-sender
      }
    )

    (ok true)
  )
)

;; Set seasonal schedule
(define-public (set-seasonal-schedule
  (storage-id uint)
  (season (string-ascii 10))
  (start-block uint)
  (end-block uint)
  (protection-protocols (string-ascii 100))
  (maintenance-frequency uint))

  (let ((storage-data (unwrap! (map-get? storage-locations { storage-id: storage-id }) ERR_STORAGE_NOT_FOUND)))
    (asserts! (is-eq tx-sender (get owner storage-data)) ERR_UNAUTHORIZED)

    (map-set seasonal-schedules
      { storage-id: storage-id, season: season }
      {
        start-block: start-block,
        end-block: end-block,
        protection-protocols: protection-protocols,
        maintenance-frequency: maintenance-frequency
      }
    )

    (ok true)
  )
)

;; Read-only Functions

;; Get storage location details
(define-read-only (get-storage-location (storage-id uint))
  (map-get? storage-locations { storage-id: storage-id })
)

;; Get broom storage info
(define-read-only (get-broom-storage-info (broom-id uint))
  (map-get? broom-storage { broom-id: broom-id })
)

;; Get storage conditions
(define-read-only (get-storage-conditions (storage-id uint) (date uint))
  (map-get? storage-conditions { storage-id: storage-id, date: date })
)

;; Get seasonal schedule
(define-read-only (get-seasonal-schedule (storage-id uint) (season (string-ascii 10)))
  (map-get? seasonal-schedules { storage-id: storage-id, season: season })
)

;; Check storage availability
(define-read-only (check-storage-availability (storage-id uint))
  (match (map-get? storage-locations { storage-id: storage-id })
    storage-data
      (some (- (get capacity storage-data) (get current-occupancy storage-data)))
    none
  )
)

;; Get optimal storage for broom
(define-read-only (get-optimal-storage (seasonal-storage bool) (security-required uint))
  ;; This would typically iterate through available storage locations
  ;; For simplicity, returning a basic recommendation
  (if seasonal-storage
    (some u1) ;; Assume storage-id 1 has seasonal protection
    (some u2) ;; Assume storage-id 2 is general purpose
  )
)
