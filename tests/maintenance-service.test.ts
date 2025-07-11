import { describe, it, expect, beforeEach } from "vitest"

// Mock contract state
const mockMaintenanceState = {
  serviceProviders: new Map(),
  maintenanceServices: new Map(),
  serviceHistory: new Map(),
  broomMaintenanceSchedule: new Map(),
  providerRatings: new Map(),
  nextServiceId: 1,
  nextProviderId: 1,
}

// Mock contract functions
const maintenanceServiceContract = {
  registerServiceProvider: (
      name: string,
      specialties: string[],
      hourlyRate: number,
      location: string,
      caller: string,
  ) => {
    const providerId = mockMaintenanceState.nextProviderId
    
    mockMaintenanceState.serviceProviders.set(providerId, {
      provider: caller,
      name,
      specialties,
      rating: 100,
      totalServices: 0,
      active: true,
      hourlyRate,
      location,
    })
    
    mockMaintenanceState.nextProviderId++
    return { success: providerId }
  },
  
  requestMaintenance: (
      broomId: number,
      providerId: number,
      serviceType: string,
      description: string,
      caller: string,
  ) => {
    const provider = mockMaintenanceState.serviceProviders.get(providerId)
    if (!provider) return { error: "ERR_PROVIDER_NOT_FOUND" }
    if (!provider.active) return { error: "ERR_PROVIDER_NOT_FOUND" }
    
    const serviceId = mockMaintenanceState.nextServiceId
    
    mockMaintenanceState.maintenanceServices.set(serviceId, {
      broomId,
      providerId,
      serviceType,
      description,
      status: "requested",
      costEstimate: 0,
      actualCost: 0,
      startDate: 0,
      completionDate: 0,
      requester: caller,
    })
    
    mockMaintenanceState.nextServiceId++
    return { success: serviceId }
  },
  
  acceptServiceRequest: (serviceId: number, costEstimate: number, caller: string) => {
    const service = mockMaintenanceState.maintenanceServices.get(serviceId)
    if (!service) return { error: "ERR_SERVICE_NOT_FOUND" }
    
    const provider = mockMaintenanceState.serviceProviders.get(service.providerId)
    if (!provider) return { error: "ERR_PROVIDER_NOT_FOUND" }
    if (provider.provider !== caller) return { error: "ERR_UNAUTHORIZED" }
    if (service.status !== "requested") return { error: "ERR_SERVICE_IN_PROGRESS" }
    
    service.status = "in-progress"
    service.costEstimate = costEstimate
    service.startDate = 1000
    
    return { success: true }
  },
  
  completeService: (serviceId: number, actualCost: number, notes: string, caller: string) => {
    const service = mockMaintenanceState.maintenanceServices.get(serviceId)
    if (!service) return { error: "ERR_SERVICE_NOT_FOUND" }
    
    const provider = mockMaintenanceState.serviceProviders.get(service.providerId)
    if (!provider) return { error: "ERR_PROVIDER_NOT_FOUND" }
    if (provider.provider !== caller) return { error: "ERR_UNAUTHORIZED" }
    if (service.status !== "in-progress") return { error: "ERR_UNAUTHORIZED" }
    
    service.status = "completed"
    service.actualCost = actualCost
    service.completionDate = 1001
    
    // Add to service history
    const historyKey = `${service.broomId}-${serviceId}`
    mockMaintenanceState.serviceHistory.set(historyKey, {
      serviceDate: 1001,
      serviceType: service.serviceType,
      providerId: service.providerId,
      cost: actualCost,
      rating: 0,
      notes,
    })
    
    // Update provider stats
    provider.totalServices++
    
    // Update maintenance schedule
    const schedule = mockMaintenanceState.broomMaintenanceSchedule.get(service.broomId) || {
      lastServiceDate: 0,
      nextServiceDue: 0,
      serviceFrequency: 1000,
      maintenanceLevel: "standard",
      autoSchedule: false,
    }
    
    schedule.lastServiceDate = 1001
    schedule.nextServiceDue = 1001 + schedule.serviceFrequency
    mockMaintenanceState.broomMaintenanceSchedule.set(service.broomId, schedule)
    
    return { success: true }
  },
  
  rateService: (serviceId: number, rating: number, comments: string, caller: string) => {
    const service = mockMaintenanceState.maintenanceServices.get(serviceId)
    if (!service) return { error: "ERR_SERVICE_NOT_FOUND" }
    if (service.requester !== caller) return { error: "ERR_UNAUTHORIZED" }
    if (service.status !== "completed") return { error: "ERR_UNAUTHORIZED" }
    
    if (rating < 1 || rating > 5) return { error: "ERR_INVALID_RATING" }
    
    // Record the rating
    const ratingKey = `${service.providerId}-${caller}`
    mockMaintenanceState.providerRatings.set(ratingKey, {
      rating,
      serviceId,
      comments,
      date: 1002,
    })
    
    // Update service history with rating
    const historyKey = `${service.broomId}-${serviceId}`
    const history = mockMaintenanceState.serviceHistory.get(historyKey)
    if (history) {
      history.rating = rating
    }
    
    // Update provider's average rating
    const provider = mockMaintenanceState.serviceProviders.get(service.providerId)
    if (provider && provider.totalServices > 0) {
      const newAverage = Math.floor(
          (provider.rating * (provider.totalServices - 1) + rating * 20) / provider.totalServices,
      )
      provider.rating = newAverage
    }
    
    return { success: true }
  },
  
  setMaintenanceSchedule: (
      broomId: number,
      serviceFrequency: number,
      maintenanceLevel: string,
      autoSchedule: boolean,
  ) => {
    mockMaintenanceState.broomMaintenanceSchedule.set(broomId, {
      lastServiceDate: 1000,
      nextServiceDue: 1000 + serviceFrequency,
      serviceFrequency,
      maintenanceLevel,
      autoSchedule,
    })
    
    return { success: true }
  },
  
  getServiceProvider: (providerId: number) => {
    return mockMaintenanceState.serviceProviders.get(providerId) || null
  },
  
  getMaintenanceService: (serviceId: number) => {
    return mockMaintenanceState.maintenanceServices.get(serviceId) || null
  },
  
  getServiceHistory: (broomId: number, serviceId: number) => {
    const historyKey = `${broomId}-${serviceId}`
    return mockMaintenanceState.serviceHistory.get(historyKey) || null
  },
  
  getMaintenanceSchedule: (broomId: number) => {
    return mockMaintenanceState.broomMaintenanceSchedule.get(broomId) || null
  },
  
  isMaintenanceDue: (broomId: number) => {
    const schedule = mockMaintenanceState.broomMaintenanceSchedule.get(broomId)
    if (!schedule) return false
    
    return 1000 >= schedule.nextServiceDue
  },
}

describe("Maintenance Service Contract", () => {
  beforeEach(() => {
    // Reset mock state
    mockMaintenanceState.serviceProviders.clear()
    mockMaintenanceState.maintenanceServices.clear()
    mockMaintenanceState.serviceHistory.clear()
    mockMaintenanceState.broomMaintenanceSchedule.clear()
    mockMaintenanceState.providerRatings.clear()
    mockMaintenanceState.nextServiceId = 1
    mockMaintenanceState.nextProviderId = 1
  })
  
  describe("registerServiceProvider", () => {
    it("should register service provider successfully", () => {
      const result = maintenanceServiceContract.registerServiceProvider(
          "BroomFix Pro",
          ["handle-repair", "bristle-replacement"],
          25,
          "Downtown",
          "provider1",
      )
      
      expect(result.success).toBe(1)
      
      const provider = maintenanceServiceContract.getServiceProvider(1)
      expect(provider).toBeTruthy()
      expect(provider?.name).toBe("BroomFix Pro")
      expect(provider?.hourlyRate).toBe(25)
      expect(provider?.active).toBe(true)
      expect(provider?.rating).toBe(100)
    })
  })
  
  describe("requestMaintenance", () => {
    beforeEach(() => {
      maintenanceServiceContract.registerServiceProvider("BroomFix Pro", ["handle-repair"], 25, "Downtown", "provider1")
    })
    
    it("should request maintenance successfully", () => {
      const result = maintenanceServiceContract.requestMaintenance(
          1,
          1,
          "handle-repair",
          "Handle is loose and needs tightening",
          "customer1",
      )
      
      expect(result.success).toBe(1)
      
      const service = maintenanceServiceContract.getMaintenanceService(1)
      expect(service).toBeTruthy()
      expect(service?.broomId).toBe(1)
      expect(service?.serviceType).toBe("handle-repair")
      expect(service?.status).toBe("requested")
    })
    
    it("should reject request for non-existent provider", () => {
      const result = maintenanceServiceContract.requestMaintenance(1, 999, "repair", "Fix it", "customer1")
      
      expect(result.error).toBe("ERR_PROVIDER_NOT_FOUND")
    })
  })
  
  describe("acceptServiceRequest", () => {
    beforeEach(() => {
      maintenanceServiceContract.registerServiceProvider("BroomFix Pro", ["handle-repair"], 25, "Downtown", "provider1")
      maintenanceServiceContract.requestMaintenance(1, 1, "handle-repair", "Handle repair needed", "customer1")
    })
    
    it("should accept service request successfully", () => {
      const result = maintenanceServiceContract.acceptServiceRequest(1, 50, "provider1")
      
      expect(result.success).toBe(true)
      
      const service = maintenanceServiceContract.getMaintenanceService(1)
      expect(service?.status).toBe("in-progress")
      expect(service?.costEstimate).toBe(50)
      expect(service?.startDate).toBe(1000)
    })
    
    it("should reject unauthorized acceptance", () => {
      const result = maintenanceServiceContract.acceptServiceRequest(1, 50, "unauthorized")
      
      expect(result.error).toBe("ERR_UNAUTHORIZED")
    })
  })
  
  describe("completeService", () => {
    beforeEach(() => {
      maintenanceServiceContract.registerServiceProvider("BroomFix Pro", ["handle-repair"], 25, "Downtown", "provider1")
      maintenanceServiceContract.requestMaintenance(1, 1, "handle-repair", "Handle repair needed", "customer1")
      maintenanceServiceContract.acceptServiceRequest(1, 50, "provider1")
    })
    
    it("should complete service successfully", () => {
      const result = maintenanceServiceContract.completeService(1, 45, "Handle tightened and reinforced", "provider1")
      
      expect(result.success).toBe(true)
      
      const service = maintenanceServiceContract.getMaintenanceService(1)
      expect(service?.status).toBe("completed")
      expect(service?.actualCost).toBe(45)
      expect(service?.completionDate).toBe(1001)
      
      const history = maintenanceServiceContract.getServiceHistory(1, 1)
      expect(history).toBeTruthy()
      expect(history?.cost).toBe(45)
      expect(history?.notes).toBe("Handle tightened and reinforced")
      
      const provider = maintenanceServiceContract.getServiceProvider(1)
      expect(provider?.totalServices).toBe(1)
    })
  })
  
  describe("rateService", () => {
    beforeEach(() => {
      maintenanceServiceContract.registerServiceProvider("BroomFix Pro", ["handle-repair"], 25, "Downtown", "provider1")
      maintenanceServiceContract.requestMaintenance(1, 1, "handle-repair", "Handle repair needed", "customer1")
      maintenanceServiceContract.acceptServiceRequest(1, 50, "provider1")
      maintenanceServiceContract.completeService(1, 45, "Good work", "provider1")
    })
    
    it("should rate service successfully", () => {
      const result = maintenanceServiceContract.rateService(1, 5, "Excellent service, very professional", "customer1")
      
      expect(result.success).toBe(true)
      
      const history = maintenanceServiceContract.getServiceHistory(1, 1)
      expect(history?.rating).toBe(5)
    })
    
    it("should reject invalid ratings", () => {
      const result1 = maintenanceServiceContract.rateService(1, 0, "Bad", "customer1")
      const result2 = maintenanceServiceContract.rateService(1, 6, "Too good", "customer1")
      
      expect(result1.error).toBe("ERR_INVALID_RATING")
      expect(result2.error).toBe("ERR_INVALID_RATING")
    })
    
    it("should reject unauthorized rating", () => {
      const result = maintenanceServiceContract.rateService(1, 5, "Good", "unauthorized")
      
      expect(result.error).toBe("ERR_UNAUTHORIZED")
    })
  })
  
  describe("setMaintenanceSchedule", () => {
    it("should set maintenance schedule successfully", () => {
      const result = maintenanceServiceContract.setMaintenanceSchedule(1, 500, "premium", true)
      
      expect(result.success).toBe(true)
      
      const schedule = maintenanceServiceContract.getMaintenanceSchedule(1)
      expect(schedule).toBeTruthy()
      expect(schedule?.serviceFrequency).toBe(500)
      expect(schedule?.maintenanceLevel).toBe("premium")
      expect(schedule?.autoSchedule).toBe(true)
    })
  })
  
  describe("isMaintenanceDue", () => {
    it("should return false when no schedule exists", () => {
      const isDue = maintenanceServiceContract.isMaintenanceDue(1)
      expect(isDue).toBe(false)
    })
    
    it("should return correct maintenance due status", () => {
      maintenanceServiceContract.setMaintenanceSchedule(1, 100, "standard", false)
      
      const isDue = maintenanceServiceContract.isMaintenanceDue(1)
      expect(isDue).toBe(false) // Current block (1000) &lt; next due (1100)
    })
  })
})
