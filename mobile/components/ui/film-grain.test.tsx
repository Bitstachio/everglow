import { render } from "@testing-library/react-native";
import { FilmGrain } from "./film-grain";

test("lays grain over the screen without taking touches", async () => {
  const { toJSON } = await render(<FilmGrain />);
  expect(toJSON()).toMatchObject({
    props: { pointerEvents: "none", importantForAccessibility: "no-hide-descendants" },
  });
});
