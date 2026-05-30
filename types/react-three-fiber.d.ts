declare module '@react-three/fiber' {
  export interface ThreeElements {}
}

declare global {
  namespace JSX {
    interface IntrinsicElements {
      group: any
      mesh: any
      primitive: any
      ambientLight: any
      hemisphereLight: any
      pointLight: any
      planeGeometry: any
      meshBasicMaterial: any
      meshStandardMaterial: any
      lineSegments: any
      lineBasicMaterial: any
    }
  }
}

export {}
