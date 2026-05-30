import * as THREE from 'three';

/**
 * CityProjection - Web Mercator projection centered on downtown Toronto
 *
 * This projection system converts between geographic coordinates (longitude, latitude)
 * and 3D world coordinates for rendering in Three.js. It uses the standard Web Mercator
 * projection (EPSG:3857) but centers the coordinate system on downtown Toronto (near
 * Union Station) to minimize floating-point precision errors.
 */
export class CityProjection {
  // Earth's radius in meters (WGS84 semi-major axis)
  private static readonly EARTH_RADIUS = 6378137;

  // Global scale factor to match imported 3D models
  // Building model at scale (1.4, 1.4, 1.4) fits correctly with map
  // To make default scale (10, 10, 10) work, scale map by 10/1.4 ≈ 7.14
  private static readonly SCALE_FACTOR = 10 / 1.4;

  // Downtown Toronto - center point for our projection (near Union Station)
  private static readonly CENTER_LNG = -79.3800;
  private static readonly CENTER_LAT = 43.6500;

  // Pre-calculate center point in Web Mercator coordinates
  private static readonly CENTER_X: number;
  private static readonly CENTER_Y: number;

  static {
    // Calculate center point coordinates using Web Mercator formulas
    const centerLngRad = (this.CENTER_LNG * Math.PI) / 180;
    const centerLatRad = (this.CENTER_LAT * Math.PI) / 180;

    this.CENTER_X = this.EARTH_RADIUS * centerLngRad;
    this.CENTER_Y = this.EARTH_RADIUS * Math.log(Math.tan(Math.PI / 4 + centerLatRad / 2));
  }

  /**
   * Projects geographic coordinates to 3D world space
   *
   * @param lngLat - [longitude, latitude] in degrees
   * @returns THREE.Vector3 position in world space (meters from center)
   */
  static projectToWorld(lngLat: [number, number]): THREE.Vector3 {
    const [lng, lat] = lngLat;

    // Convert to radians
    const lngRad = (lng * Math.PI) / 180;
    const latRad = (lat * Math.PI) / 180;

    // Apply Web Mercator projection formulas
    const x = this.EARTH_RADIUS * lngRad;
    const y = this.EARTH_RADIUS * Math.log(Math.tan(Math.PI / 4 + latRad / 2));

    // Subtract center point to keep scene centered at origin
    const worldX = x - this.CENTER_X;
    const worldY = y - this.CENTER_Y;

    // Apply global scale factor to match imported 3D models
    const scaledX = worldX * this.SCALE_FACTOR;
    const scaledY = worldY * this.SCALE_FACTOR;

    // Return as Three.js vector (x, z, y) - note: y is up in Three.js
    return new THREE.Vector3(scaledX, 0, -scaledY);
  }

  /**
   * Unprojects 3D world space coordinates back to geographic coordinates
   *
   * @param position - THREE.Vector3 position in world space
   * @returns [longitude, latitude] in degrees
   */
  static unprojectFromWorld(position: THREE.Vector3): [number, number] {
    // Convert back from Three.js coordinates (x, z, y)
    const scaledX = position.x;
    const scaledY = -position.z;

    // Reverse the global scale factor
    const worldX = scaledX / this.SCALE_FACTOR;
    const worldY = scaledY / this.SCALE_FACTOR;

    // Add center point back
    const x = worldX + this.CENTER_X;
    const y = worldY + this.CENTER_Y;

    // Reverse Web Mercator projection
    const lngRad = x / this.EARTH_RADIUS;
    const latRad = 2 * Math.atan(Math.exp(y / this.EARTH_RADIUS)) - Math.PI / 2;

    // Convert to degrees
    const lng = (lngRad * 180) / Math.PI;
    const lat = (latRad * 180) / Math.PI;

    return [lng, lat];
  }

  /**
   * Get the center point coordinates
   */
  static getCenter(): [number, number] {
    return [this.CENTER_LNG, this.CENTER_LAT];
  }

  /**
   * Calculate the scale factor at a given latitude
   * Web Mercator scale varies with latitude
   *
   * @param lat - Latitude in degrees
   * @returns Scale factor at that latitude
   */
  static getScaleAtLatitude(lat: number): number {
    const latRad = (lat * Math.PI) / 180;
    return 1 / Math.cos(latRad);
  }
}
