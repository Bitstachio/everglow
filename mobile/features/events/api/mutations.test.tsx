import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, userEvent, waitFor } from "@testing-library/react-native";
import { Button, Text, View } from "react-native";
import { eventsKeys } from "./keys";
import { useCreateEventMutation } from "./mutations";

const mockCreate = jest.fn();
jest.mock("@/lib/api/generated/client.gen", () => ({ client: { getConfig: () => ({}) } }));
jest.mock("@/lib/api/generated", () => ({
  eventsControllerCreate: (...args: unknown[]) => mockCreate(...args),
}));

const body = { title: "Meetup", date: "2030-06-15T18:30:00.000Z" };
const MutationProbe = () => {
  const mutation = useCreateEventMutation();
  return (
    <View>
      <Button title="Create" onPress={() => mutation.mutate(body)} />
      {mutation.data && <Text>{mutation.data.title}</Text>}
      {mutation.isError && <Text>Creation failed</Text>}
    </View>
  );
};

test.each([true, false])(
  "creation success=%s unwraps the response and invalidates only on success",
  async (success) => {
    const client = new QueryClient({ defaultOptions: { mutations: { retry: false, gcTime: 0 } } });
    const key = eventsKeys.list("user-1");
    client.setQueryData(key, []);
    mockCreate.mockReset();
    if (success) mockCreate.mockResolvedValue({ data: { data: { id: "event-1", ...body } } });
    else mockCreate.mockRejectedValue(new Error("Network unavailable"));
    const view = await render(
      <QueryClientProvider client={client}>
        <MutationProbe />
      </QueryClientProvider>,
    );
    await userEvent.setup().press(screen.getByRole("button", { name: "Create" }));
    expect(await screen.findByText(success ? "Meetup" : "Creation failed")).toBeOnTheScreen();
    expect(mockCreate).toHaveBeenCalledWith({ body, throwOnError: true });
    await waitFor(() => expect(client.getQueryState(key)?.isInvalidated).toBe(success));
    await view.unmount();
    client.clear();
  },
);
