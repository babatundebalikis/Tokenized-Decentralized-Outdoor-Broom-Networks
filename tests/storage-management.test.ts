import { describe, it, expect, beforeEach } from "vitest"

// Mock contract state
const mockStorageState = {
  storageLocations: new Map(),
  broomStorage: new Map(),
  storageConditions: new Map(),
  seasonalSchedules: new Map(),
  nextStorageId: 1,
}

// Mock contract functions
const storageManagementContract = {
  registerStorageLocation: (
      locationName: string,
      capacity: number,
      climateControlled: boolean,
      securityLevel: number,
      seasonalProtection: boolean,
      lat: number,
      lng: number,
      caller: string,
  ) => {
    if (capacity <= 0) return { error: "ERR_INVALID_CAPACITY" }
    if (securityLevel < 1 || securityLevel > 5) return { error: "ERR_UNAUTHORIZED" }
    
    const storageId = mockStorageState.nextStorageId
    
    mockStorageState.storageLocations.set(storageId, {
      owner: caller,
      locationName,
      capacity,
      currentOccupancy: 0,
      climateControlled,
      securityLevel,
      seasonalProtection,
      coordinates: { lat, lng },
    })
    
    mockStorageState.nextStorageId++
    return { success: storageId }
  },
  
  storeBroom: (
      broomId: number,
      storageId: number,
      expectedRetrieval: number,
      storageCondition: string,
      seasonalStorage: boolean,
  ) => {
    const storage = mockStorageState.storageLocations.get(storageId)
    if (!storage) return { error: "ERR_STORAGE_NOT_FOUND" }
    
    if (mockStorageState.broomStorage.has(broomId)) {
      return { error: "ERR_ALREADY_STORED" }
    }
    
    if (storage.currentOccupancy >= storage.capacity) {
      return { error: "ERR_STORAGE_FULL" }
    }
    
    mockStorageState.broomStorage.set(broomId, {
      storageId,
      storedDate: 1000,
      expectedRetrieval,
      storageCondition,
      protectionLevel: storage.securityLevel,
      seasonalStorage,
    })
    
    storage.currentOccupancy++
    return { success: true }
  },
  
  retrieveBroom: (broomId: number) => {
    const storageInfo = mockStorageState.broomStorage.get(broomId)
    if (!storageInfo) return { error: "ERR_BROOM_NOT_FOUND" }
    
    const storage = mockStorageState.storageLocations.get(storageInfo.storageId)
    if (!storage) return { error: "ERR_STORAGE_NOT_FOUND" }
    
    mockStorageState.broomStorage.delete(broomId)
    storage.currentOccupancy--
    
    return { success: true }
  },
  
  recordStorageConditions: (
      storageId: number,
      temperature: number,
      humidity: number,
      securityCheck: boolean,
      maintenanceStatus: string,
      caller: string,
  ) => {
    const storage = mockStorageState.storageLocations.get(storageId)
    if (!storage) return { error: "ERR_STORAGE_NOT_FOUND" }
    if (storage.owner !== caller) return { error: "ERR_UNAUTHORIZED" }
    
    const conditionKey = `${storageId}-${1000}`
    mockStorageState.storageConditions.set(conditionKey, {
      temperature,
      humidity,
      securityCheck,
      maintenanceStatus,
      inspector: caller,
    })
    
    return { success: true }
  },
  
  getStorageLocation: (storageId: number) => {
    return mockStorageState.storageLocations.get(storageId) || null
  },
  
  getBroomStorageInfo: (broomId: number) => {
    return mockStorageState.broomStorage.get(broomId) || null
  },
  
  checkStorageAvailability: (storageId: number) => {
    const storage = mockStorageState.storageLocations.get(storageId)
    return storage ? storage.capacity - storage.currentOccupancy : null
  },
}

describe("Storage Management Contract", () => {
  beforeEach(() => {
    // Reset mock state
    mockStorageState.storageLocations.clear()
    mockStorageState.broomStorage.clear()
    mockStorageState.storageConditions.clear()
    mockStorageState.seasonalSchedules.clear()
    mockStorageState.nextStorageId = 1
  })
  
  describe("registerStorageLocation", () => {
    it("should register storage location successfully", () => {
      const result = storageManagementContract.registerStorageLocation(
          "Community Center",
          50,
          true,
          4,
          true,
          40.7128,
          -74.006,
          "owner1",
      )
      
      expect(result.success).toBe(1)
      
      const storage = storageManagementContract.getStorageLocation(1)
      expect(storage).toBeTruthy()
      expect(storage?.locationName).toBe("Community Center")
      expect(storage?.capacity).toBe(50)
      expect(storage?.climateControlled).toBe(true)
    })
    
    it("should reject invalid capacity", () => {
      const result = storageManagementContract.registerStorageLocation(
          "Bad Storage",
          0,
          false,
          3,
          false,
          0,
          0,
          "owner1",
      )
      
      expect(result.error).toBe("ERR_INVALID_CAPACITY")
    })
    
    it("should reject invalid security level", () => {
      const result = storageManagementContract.registerStorageLocation(
          "Bad Security",
          10,
          false,
          6,
          false,
          0,
          0,
          "owner1",
      )
      
      expect(result.error).toBe("ERR_UNAUTHORIZED")
    })
  })
  
  describe("storeBroom", () => {
    beforeEach(() => {
      storageManagementContract.registerStorageLocation("Test Storage", 5, true, 3, true, 0, 0, "owner1")
    })
    
    it("should store broom successfully", () => {
      const result = storageManagementContract.storeBroom(1, 1, 2000, "good", true)
      
      expect(result.success).toBe(true)
      
      const storageInfo = storageManagementContract.getBroomStorageInfo(1)
      expect(storageInfo).toBeTruthy()
      expect(storageInfo?.storageId).toBe(1)
      expect(storageInfo?.seasonalStorage).toBe(true)
      
      const storage = storageManagementContract.getStorageLocation(1)
      expect(storage?.currentOccupancy).toBe(1)
    })
    
    it("should reject storing already stored broom", () => {
      storageManagementContract.storeBroom(1, 1, 2000, "good", true)
      const result = storageManagementContract.storeBroom(1, 1, 2000, "good", true)
      
      expect(result.error).toBe("ERR_ALREADY_STORED")
    })
    
    it("should reject storing in full storage", () => {
      // Fill up storage
      for (let i = 1; i <= 5; i++) {
        storageManagementContract.storeBroom(i, 1, 2000, "good", false)
      }
      
      const result = storageManagementContract.storeBroom(6, 1, 2000, "good", false)
      expect(result.error).toBe("ERR_STORAGE_FULL")
    })
  })
  
  describe("retrieveBroom", () => {
    beforeEach(() => {
      storageManagementContract.registerStorageLocation("Test Storage", 5, true, 3, true, 0, 0, "owner1")
      storageManagementContract.storeBroom(1, 1, 2000, "good", true)
    })
    
    it("should retrieve broom successfully", () => {
      const result = storageManagementContract.retrieveBroom(1)
      
      expect(result.success).toBe(true)
      
      const storageInfo = storageManagementContract.getBroomStorageInfo(1)
      expect(storageInfo).toBeNull()
      
      const storage = storageManagementContract.getStorageLocation(1)
      expect(storage?.currentOccupancy).toBe(0)
    })
    
    it("should handle non-existent broom", () => {
      const result = storageManagementContract.retrieveBroom(999)
      
      expect(result.error).toBe("ERR_BROOM_NOT_FOUND")
    })
  })
  
  describe("checkStorageAvailability", () => {
    beforeEach(() => {
      storageManagementContract.registerStorageLocation("Test Storage", 5, true, 3, true, 0, 0, "owner1")
    })
    
    it("should return correct availability", () => {
      const availability1 = storageManagementContract.checkStorageAvailability(1)
      expect(availability1).toBe(5)
      
      storageManagementContract.storeBroom(1, 1, 2000, "good", true)
      storageManagementContract.storeBroom(2, 1, 2000, "good", true)
      
      const availability2 = storageManagementContract.checkStorageAvailability(1)
      expect(availability2).toBe(3)
    })
    
    it("should return null for non-existent storage", () => {
      const availability = storageManagementContract.checkStorageAvailability(999)
      expect(availability).toBeNull()
    })
  })
})
