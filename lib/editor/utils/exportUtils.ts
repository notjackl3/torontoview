import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import * as THREE from 'three';
import { BuildingSpecification, BuildingExportData, BuildingInstance, MultiBuildingExportData } from '@/lib/editor/types/buildingSpec';

export function exportToGLB(buildingGroup: THREE.Group, filename: string = 'building.glb'): Promise<void> {
  return new Promise((resolve, reject) => {
    const exporter = new GLTFExporter();

    exporter.parse(
      buildingGroup,
      (result) => {
        // result is an ArrayBuffer for GLB
        const blob = new Blob([result as ArrayBuffer], { type: 'application/octet-stream' });
        const url = URL.createObjectURL(blob);

        // Trigger download
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        resolve();
      },
      (error) => {
        console.error('Export failed:', error);
        reject(error);
      },
      { binary: true } // GLB format
    );
  });
}

// Multi-building GLB export
export function exportMultiBuildingsToGLB(scene: THREE.Scene, filename: string = 'buildings.glb'): Promise<void> {
  return new Promise((resolve, reject) => {
    const exporter = new GLTFExporter();

    exporter.parse(
      scene,
      (result) => {
        const blob = new Blob([result as ArrayBuffer], { type: 'application/octet-stream' });
        const url = URL.createObjectURL(blob);

        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        resolve();
      },
      (error) => {
        console.error('Multi-building export failed:', error);
        reject(error);
      },
      { binary: true }
    );
  });
}

export function exportToJSON(
  spec: BuildingSpecification,
  filename: string = 'building-spec.json'
): void {
  const exportData: BuildingExportData = {
    version: '1.0',
    building: spec,
    position: {
      longitude: null,
      latitude: null,
      altitude: 0,
      rotation: 0,
    },
    metadata: {
      createdAt: new Date().toISOString(),
    },
  };

  const json = JSON.stringify(exportData, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);

  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// Multi-building JSON export
export function exportMultiBuildingsToJSON(
  buildings: BuildingInstance[],
  filename: string = 'buildings-spec.json'
): void {
  const exportData: MultiBuildingExportData = {
    version: '2.0',
    buildings,
    metadata: {
      createdAt: new Date().toISOString(),
    },
  };

  const json = JSON.stringify(exportData, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);

  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function copyToClipboard(spec: BuildingSpecification): Promise<void> {
  const exportData: BuildingExportData = {
    version: '1.0',
    building: spec,
    position: {
      longitude: null,
      latitude: null,
      altitude: 0,
      rotation: 0,
    },
    metadata: {
      createdAt: new Date().toISOString(),
    },
  };

  const json = JSON.stringify(exportData, null, 2);
  return navigator.clipboard.writeText(json);
}

// Multi-building clipboard copy
export function copyMultiBuildingsToClipboard(buildings: BuildingInstance[]): Promise<void> {
  const exportData: MultiBuildingExportData = {
    version: '2.0',
    buildings,
    metadata: {
      createdAt: new Date().toISOString(),
    },
  };

  const json = JSON.stringify(exportData, null, 2);
  return navigator.clipboard.writeText(json);
}

export function importFromJSON(jsonString: string): BuildingSpecification | null {
  try {
    const data: BuildingExportData = JSON.parse(jsonString);
    if (data.version === '1.0' && data.building) {
      return data.building;
    }
    return null;
  } catch (error) {
    console.error('Error parsing JSON:', error);
    return null;
  }
}

// Multi-building JSON import
export function importMultiBuildingsFromJSON(jsonString: string): BuildingInstance[] | null {
  try {
    const data: MultiBuildingExportData = JSON.parse(jsonString);
    if (data.version === '2.0' && data.buildings) {
      return data.buildings;
    }
    return null;
  } catch (error) {
    console.error('Error parsing multi-building JSON:', error);
    return null;
  }
}

// Helper function to check if an object or its ancestors should be excluded
function shouldExclude(object: THREE.Object3D): boolean {
  let current: THREE.Object3D | null = object;
  while (current) {
    if (current.userData?.excludeFromExport) {
      return true;
    }
    // Check name patterns
    const name = current.name.toLowerCase();
    if (
      name.includes('grid') ||
      name.includes('plane') ||
      name.includes('helper') ||
      name.includes('click-detection')
    ) {
      return true;
    }
    current = current.parent;
  }
  return false;
}

// Helper function to clean a cloned group of any flat planes, grids, and unwanted geometry
function cleanClonedGroup(group: THREE.Group): void {
  const toRemove: THREE.Object3D[] = [];

  group.traverse((child) => {
    // Skip if not a mesh
    if (!(child instanceof THREE.Mesh)) {
      // Also check for groups/objects that should be excluded by name
      const name = child.name.toLowerCase();
      if (
        name.includes('grid') ||
        name.includes('plane') ||
        name.includes('helper') ||
        name.includes('click-detection') ||
        name.includes('ground')
      ) {
        toRemove.push(child);
      }
      return;
    }

    // Remove invisible meshes
    if (!child.visible) {
      toRemove.push(child);
      return;
    }

    // Check for transparent/invisible materials
    if (child.material) {
      const mat = child.material as THREE.Material;
      if (mat.transparent && (mat as THREE.MeshBasicMaterial).opacity < 0.1) {
        toRemove.push(child);
        return;
      }
    }

    // Check name patterns for exclusion
    const name = child.name.toLowerCase();
    if (
      name.includes('grid') ||
      name.includes('plane') ||
      name.includes('helper') ||
      name.includes('click-detection') ||
      name.includes('ground')
    ) {
      toRemove.push(child);
      return;
    }

    // Check userData for exclusion
    if (child.userData?.excludeFromExport) {
      toRemove.push(child);
      return;
    }

    // Check for plane geometry specifically (any size)
    if (child.geometry instanceof THREE.PlaneGeometry) {
      toRemove.push(child);
      return;
    }

    // Check if it's a flat plane by dimensions
    if (child.geometry) {
      child.geometry.computeBoundingBox();
      const box = child.geometry.boundingBox;
      if (box) {
        const sizeY = box.max.y - box.min.y;
        const sizeX = box.max.x - box.min.x;
        const sizeZ = box.max.z - box.min.z;

        // If it's very flat (thin in Y) and reasonably large, it's likely a plane/ground
        // Use more aggressive thresholds
        if (sizeY < 0.2 && (sizeX > 20 || sizeZ > 20)) {
          toRemove.push(child);
          return;
        }

        // Also catch very large flat objects in any orientation
        if (sizeX > 100 || sizeZ > 100) {
          toRemove.push(child);
          return;
        }
      }
    }
  });

  // Remove the identified objects
  toRemove.forEach((obj) => {
    if (obj.parent) {
      obj.parent.remove(obj);
    }
  });
}

// Export to Map - sends GLB to API and returns the building ID
export async function exportToMap(
  scene: THREE.Scene,
  buildingName: string = 'building'
): Promise<{ id: string; url: string }> {
  return new Promise((resolve, reject) => {
    const exporter = new GLTFExporter();

    // Create a new group containing only the building meshes
    // This filters out grid planes, lights, helpers, etc.
    const exportGroup = new THREE.Group();
    exportGroup.name = 'exported-buildings';

    // First, try to find building groups marked with userData.isBuilding
    scene.traverse((object) => {
      if (object instanceof THREE.Group && object.userData?.isBuilding) {
        // Skip if this object or ancestor is marked for exclusion
        if (shouldExclude(object)) {
          return;
        }

        // Skip invisible groups
        if (!object.visible) {
          return;
        }

        // Clone the building group
        const clonedGroup = object.clone();

        // Clean any unwanted geometry from the clone
        cleanClonedGroup(clonedGroup);

        // Only add if there's actual content after cleaning
        if (clonedGroup.children.length > 0) {
          exportGroup.add(clonedGroup);
          console.log(`📦 Found marked building: ${object.name}`);
        }
      }
    });

    // If we found marked buildings, we're done
    if (exportGroup.children.length > 0) {
      console.log(`📦 Exporting ${exportGroup.children.length} marked building(s) to map`);
    } else {
      // Fallback: Find and clone only building-related objects
      console.log('⚠️ No marked buildings found, using fallback detection...');

      scene.traverse((object) => {
        // Skip non-mesh objects (lights, cameras, helpers)
        if (!(object instanceof THREE.Mesh) && !(object instanceof THREE.Group)) {
          return;
        }

        // Skip invisible objects (like the grid plane for click detection)
        if (!object.visible) {
          return;
        }

        // Skip objects that are clearly not buildings
        const name = object.name.toLowerCase();
        if (
          name.includes('grid') ||
          name.includes('plane') ||
          name.includes('helper') ||
          name.includes('control') ||
          name.includes('ghost') ||
          name.includes('effect') ||
          name.includes('particle')
        ) {
          return;
        }

        // Skip very large planes (likely ground/grid planes)
        if (object instanceof THREE.Mesh && object.geometry) {
          const boundingBox = new THREE.Box3().setFromObject(object);
          const size = new THREE.Vector3();
          boundingBox.getSize(size);

          // If the object is very flat and very large, it's probably a plane
          if ((size.y < 0.5 && size.x > 100) || (size.y < 0.5 && size.z > 100)) {
            return;
          }
        }

        // Skip objects marked for exclusion
        if (object.userData?.excludeFromExport) {
          return;
        }

        // Only add top-level groups that contain building geometry
        // Check if this is a building group (usually has building-related children)
        if (object.parent === scene && object instanceof THREE.Group) {
          const hasMeshChildren = object.children.some(
            (child) => child instanceof THREE.Mesh && child.visible
          );
          if (hasMeshChildren) {
            const clonedGroup = object.clone();
            // Apply cleanup to remove any planes/grids that might be in the group
            cleanClonedGroup(clonedGroup);
            if (clonedGroup.children.length > 0) {
              exportGroup.add(clonedGroup);
            }
          }
        }
      });

      // If still no building groups found, try to find any visible mesh in the scene
      if (exportGroup.children.length === 0) {
        scene.traverse((object) => {
          if (
            object instanceof THREE.Mesh &&
            object.visible &&
            object.geometry &&
            object.parent
          ) {
            // Skip objects marked for exclusion
            if (object.userData?.excludeFromExport) {
              return;
            }

            // Skip by name patterns
            const name = object.name.toLowerCase();
            if (
              name.includes('grid') ||
              name.includes('plane') ||
              name.includes('helper') ||
              name.includes('click-detection') ||
              name.includes('ground')
            ) {
              return;
            }

            // Skip plane geometry
            if (object.geometry instanceof THREE.PlaneGeometry) {
              return;
            }

            const boundingBox = new THREE.Box3().setFromObject(object);
            const size = new THREE.Vector3();
            boundingBox.getSize(size);

            // Skip flat planes - use stricter thresholds
            const isFlat = size.y < 0.5;
            const isLarge = size.x > 50 || size.z > 50;
            if (isFlat && isLarge) {
              return;
            }

            // Only include if it's a reasonable building-sized object
            if (size.y > 0.5 && size.x < 100 && size.z < 100) {
              // Clone the mesh with its material
              const clonedMesh = object.clone();
              exportGroup.add(clonedMesh);
            }
          }
        });
      }

      console.log(`📦 Exporting ${exportGroup.children.length} objects to map (fallback)`);
    }

    // Final cleanup pass on the entire export group
    cleanClonedGroup(exportGroup);

    // Log what's being exported for debugging
    console.log('📦 Final export group contents:');
    exportGroup.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        console.log(`  - Mesh: ${obj.name || 'unnamed'}, geometry: ${obj.geometry.type}`);
      }
    });

    exporter.parse(
      exportGroup,
      async (result) => {
        try {
          const arrayBuffer = result as ArrayBuffer;

          // Send to the API
          const response = await fetch('/api/editor/building', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/octet-stream',
              'X-Building-Name': buildingName,
            },
            body: arrayBuffer,
          });

          if (!response.ok) {
            throw new Error(`Failed to store building: ${response.statusText}`);
          }

          const data = await response.json();
          const url = `/api/editor/building/${data.id}`;

          console.log(`✅ Building exported to map: ${url} (${(arrayBuffer.byteLength / 1024).toFixed(1)} KB)`);

          resolve({ id: data.id, url });
        } catch (error) {
          console.error('Failed to export to map:', error);
          reject(error);
        }
      },
      (error) => {
        console.error('GLB export failed:', error);
        reject(error);
      },
      { binary: true }
    );
  });
}
