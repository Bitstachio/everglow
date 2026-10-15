import { render } from "@testing-library/react-native";
import { GreasePencil } from "./grease-pencil";

test("draws a cross in two strokes, hidden from assistive tech", async () => {
  const { toJSON } = await render(<GreasePencil mark="cross" width={40} height={40} drawOn />);
  const tree = JSON.stringify(toJSON());
  expect(tree).toContain('"importantForAccessibility":"no-hide-descendants"');
  expect(tree.match(/"type":"RNSVGPath"/g)).toHaveLength(2);
});
