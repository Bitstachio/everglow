declare module "*.svg" {
  import React from "react";
  import { SvgProps } from "react-native-svg";
  const content: React.FC<SvgProps>;
  export default content;
}

declare module "*.png" {
  const source: number;
  export default source;
}

declare module "*.jpg" {
  const source: number;
  export default source;
}

// TypeScript 6 enables noUncheckedSideEffectImports by default.
declare module "*.css" {}
