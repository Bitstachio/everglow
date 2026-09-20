declare module "*.svg" {
  import React from "react";
  import { SvgProps } from "react-native-svg";
  const content: React.FC<SvgProps>;
  export default content;
}

// TypeScript 6 enables noUncheckedSideEffectImports by default.
declare module "*.css" {}
