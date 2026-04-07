import logger from "../core/logger.js";

/**
 * Manages ad rotation schedules to avoid audience fatigue.
 * Optimization #1: Rotation based on daily or weekly schedules.
 */
export class AdRotationManager {
  /**
   * Calculates the ideal start/end time for an ad set based on rotation rules.
   * If rotating daily, it assigns a specific day of the week.
   */
  static getRotationSchedule(dayOfWeek?: 0 | 1 | 2 | 3 | 4 | 5 | 6): {
    startTime: string;
    endTime: string;
  } {
    const now = new Date();
    const start = new Date(now);
    
    if (dayOfWeek !== undefined) {
      const currentDay = now.getDay();
      const diff = (dayOfWeek + 7 - currentDay) % 7;
      start.setDate(now.getDate() + diff);
    }
    
    // Set to start of day
    start.setHours(0, 0, 0, 0);
    
    // Default 7-day rotation (Optimization #6)
    const end = new Date(start.getTime() + 7 * 24 * 60 * 60 * 1000);
    
    logger.info(`[ROTATION] Assigned schedule: ${start.toDateString()} to ${end.toDateString()}`);
    
    return {
      startTime: start.toISOString(),
      endTime: end.toISOString(),
    };
  }

  /**
   * Generates a rotation-friendly name for an Ad Set.
   */
  static getRotationAdSetName(baseName: string, variant: string): string {
    const timestamp = new Date().toISOString().split('T')[0];
    return `${baseName}_${variant}_ROTATION_${timestamp}`;
  }
}
