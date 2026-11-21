import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { describe, expect, it, vi } from "vitest";

import { emptyForm } from "@shared/lib/adminMessageForm";
import type { AdminMessage } from "@shared/lib/inAppMessages";

import i18n from "@/lib/i18n";

vi.mock("@/components/AuthProvider", () => ({ useAuth: () => ({ user: { id: "11111111-1111-4111-8111-111111111111", email: "admin@example.com" } }) }));
const preview = vi.hoisted(() => ({ calls: [] as { message: unknown; language: string }[] }));
vi.mock("@/components/inAppMessages/InAppMessagePreview", () => ({
  InAppMessagePreview: (props: { message: unknown; language: string }) => {
    preview.calls.push(props);
    return <div data-testid="drawn-preview">{props.language}</div>;
  },
}));

import { MessageComposer, type ComposerApi } from "./MessageComposer";
import { MessageList } from "./MessageList";

function savedMessage(overrides: Partial<AdminMessage> = {}): AdminMessage {
  return {
    id: "m1",
    name: "Spring update",
    status: "draft",
    presentation: "sheet",
    tone: "info",
    content: { en: { title: "Hello", body: "News" } },
    dismissible: true,
    required: false,
    frequency: { type: "once" },
    priority: 0,
    startsAt: null,
    endsAt: null,
    targeting: {},
    seenCount: 4,
    dismissedCount: 1,
    clickedCount: 2,
    ...overrides,
  };
}

function api(overrides: Partial<ComposerApi> = {}): ComposerApi {
  return {
    save: vi.fn(async (draft) => savedMessage({ ...draft, id: "m9", name: draft.name } as Partial<AdminMessage>)),
    setStatus: vi.fn().mockResolvedValue(undefined),
    upload: vi.fn().mockResolvedValue("https://example.com/image.png"),
    people: vi.fn().mockResolvedValue([]),
    ...overrides,
  };
}

function renderComposer(calls: ComposerApi, onDone = vi.fn()) {
  render(
    <I18nextProvider i18n={i18n}>
      <MessageComposer initial={emptyForm()} initialStatus={null} onCancel={vi.fn()} onDone={onDone} api={calls} />
    </I18nextProvider>,
  );
  return onDone;
}

describe("MessageComposer", () => {
  it("marks what is missing instead of saving", async () => {
    const calls = api();
    renderComposer(calls);
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByText(/Fix \d+ things? marked above\./)).toBeDefined();
    expect(calls.save).not.toHaveBeenCalled();
    expect(screen.getByLabelText(/^Name/).getAttribute("aria-invalid")).toBe("true");
  });

  it("saves and goes live, and shows the draft in the preview as it is typed", async () => {
    const calls = api();
    const onDone = renderComposer(calls);
    fireEvent.change(screen.getByLabelText(/^Name/), { target: { value: "Winter" } });
    fireEvent.change(screen.getByLabelText(/^Title in English/), { target: { value: "Snow is here" } });
    const last = preview.calls[preview.calls.length - 1] as { message: { content: { en: { title: string } } }; language: string };
    expect(last.message.content.en.title).toBe("Snow is here");
    expect(last.language).toBe("en");

    fireEvent.click(screen.getByRole("button", { name: "Save and go live" }));
    await waitFor(() => expect(onDone).toHaveBeenCalledWith("“Winter” is live."));
    expect(calls.save).toHaveBeenCalledWith(expect.objectContaining({ name: "Winter", content: { en: { title: "Snow is here", body: "" } } }));
    expect(calls.setStatus).toHaveBeenCalledWith("m9", "live");
  });

  it("turns emails into user ids before saving, and names an email nobody has", async () => {
    const calls = api({ people: vi.fn().mockResolvedValue([{ id: "22222222-2222-4222-8222-222222222222", email: "cook@example.com" }]) });
    renderComposer(calls);
    fireEvent.change(screen.getByLabelText(/^Name/), { target: { value: "To one" } });
    fireEvent.change(screen.getByLabelText(/^Title in English/), { target: { value: "Hi" } });
    fireEvent.change(screen.getByLabelText(/^Users/), { target: { value: "cook@example.com nobody@example.com" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByText("No user has the email nobody@example.com.")).toBeDefined();
    expect(calls.save).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText(/^Users/), { target: { value: "cook@example.com" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(calls.save).toHaveBeenCalledWith(expect.objectContaining({ targeting: { userIds: ["22222222-2222-4222-8222-222222222222"] } })),
    );
  });

  it("sends a test copy to the admin only", async () => {
    const calls = api();
    const onDone = renderComposer(calls);
    fireEvent.change(screen.getByLabelText(/^Name/), { target: { value: "Winter" } });
    fireEvent.change(screen.getByLabelText(/^Title in English/), { target: { value: "Snow" } });
    fireEvent.click(screen.getByRole("button", { name: "Send to me only" }));
    await waitFor(() => expect(onDone).toHaveBeenCalled());
    expect(calls.save).toHaveBeenCalledWith(
      expect.objectContaining({ name: "Test: Winter", targeting: { userIds: ["11111111-1111-4111-8111-111111111111"] }, frequency: { type: "every_launch" } }),
    );
  });

  it("asks before sending a test of a message that can't be closed", async () => {
    const calls = api();
    renderComposer(calls);
    fireEvent.change(screen.getByLabelText(/^Name/), { target: { value: "Must update" } });
    fireEvent.change(screen.getByLabelText(/^Title in English/), { target: { value: "Update" } });
    fireEvent.click(screen.getByRole("switch", { name: "Required" }));
    expect(screen.getByRole("button", { name: "Full screen" }).getAttribute("aria-pressed")).toBe("true");
    // A message that can't be closed needs a button that leads somewhere.
    fireEvent.click(screen.getByRole("switch", { name: "Primary button" }));
    fireEvent.click(screen.getAllByRole("button", { name: "Store page" })[0]);
    fireEvent.change(screen.getByLabelText(/^Primary button label in English/), { target: { value: "Update" } });
    fireEvent.click(screen.getByRole("button", { name: "Send to me only" }));
    const dialog = await screen.findByRole("dialog", { name: "Send a test copy?" });
    expect(calls.save).not.toHaveBeenCalled();
    fireEvent.click(within(dialog).getByRole("button", { name: "Send" }));
    await waitFor(() => expect(calls.save).toHaveBeenCalled());
  });
});

describe("MessageList", () => {
  it("shows each message's status and counts, and stops a live one after asking", async () => {
    const setStatus = vi.fn().mockResolvedValue(undefined);
    const onChanged = vi.fn();
    render(
      <I18nextProvider i18n={i18n}>
        <MessageList
          messages={[savedMessage({ status: "live" }), savedMessage({ id: "m2", name: "Old", status: "ended" })]}
          loading={false}
          error={null}
          onNew={vi.fn()}
          onEdit={vi.fn()}
          onDuplicate={vi.fn()}
          onChanged={onChanged}
          api={{ setStatus, remove: vi.fn() }}
        />
      </I18nextProvider>,
    );
    const live = screen.getByRole("heading", { name: "Spring update" }).closest("li")!;
    expect(within(live).getByText("Live")).toBeDefined();
    expect(within(live).getByText("To: Everyone signed in")).toBeDefined();
    expect(within(live).getByText("4")).toBeDefined();

    fireEvent.click(screen.getByRole("button", { name: /^Ended/ }));
    expect(screen.queryByRole("heading", { name: "Spring update" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /^All/ }));

    fireEvent.click(within(screen.getByRole("heading", { name: "Spring update" }).closest("li")!).getByRole("button", { name: "Stop" }));
    const dialog = await screen.findByRole("dialog", { name: "Stop this message?" });
    fireEvent.click(within(dialog).getByRole("button", { name: "Stop" }));
    await waitFor(() => expect(setStatus).toHaveBeenCalledWith("m1", "stopped"));
    expect(onChanged).toHaveBeenCalledWith("Stopped “Spring update”.");
  });
});
