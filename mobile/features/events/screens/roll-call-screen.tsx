import { BottomSheet } from "@/components/ui/bottom-sheet/bottom-sheet";
import { Button } from "@/components/ui/button";
import { Display } from "@/components/ui/display";
import { EdgePrint } from "@/components/ui/edge-print";
import { FilmGrain } from "@/components/ui/film-grain";
import { IconButton } from "@/components/ui/icon-button";
import { SafeAreaView } from "@/components/ui/safe-area-view";
import { Spinner } from "@/components/ui/spinner";
import { BackButton, TopBar } from "@/components/ui/top-bar";
import { BlockSlip } from "@/features/moderation/components/block-slip";
import { colorTokens } from "@/theme/tokens";
import { UserPlus } from "phosphor-react-native";
import { useTranslation } from "react-i18next";
import { Pressable, RefreshControl, ScrollView, Text, View } from "react-native";
import { ChangeRoleSlip } from "../components/change-role-slip";
import { LastHostSlip } from "../components/last-host-slip";
import { PersonMenu } from "../components/person-menu";
import { RemovePersonSlip } from "../components/remove-person-slip";
import { RollCapacity } from "../components/roll-capacity";
import { ROLE_KEY, RollPeopleList } from "../components/roll-people-list";
import { useRollCallScreen } from "../hooks/use-roll-call-screen";

/** 11.1 / 11.7 The roll call, as a host or a guest, and what opens over it (11.2–11.6, 11.8). */
const RollCallScreen = () => {
  const { t } = useTranslation(["roll", "common"]);
  const screen = useRollCallScreen();
  const { event } = screen;

  return (
    <SafeAreaView className="flex-1 bg-ground">
      <TopBar
        title={event?.title}
        left={<BackButton accessibilityLabel={t("common:actions.back")} onPress={screen.onBack} />}
        right={
          screen.canInvite ? (
            <IconButton accessibilityLabel={t("roll:people.invite")} onPress={screen.onInvite}>
              <UserPlus size={18} weight="bold" color={colorTokens.text} />
            </IconButton>
          ) : null
        }
      />

      {screen.isLoading ? (
        <View className="flex-1 items-center justify-center">
          <Spinner label={t("roll:people.loading")} />
        </View>
      ) : screen.isError || !event ? (
        <View className="flex-1 items-start gap-2 px-5 pt-4">
          <Display>{t("roll:people.title")}</Display>
          <Text className="mt-3 font-sans text-body text-text-2">{t("roll:people.loadFailed")}</Text>
          <Button
            title={t("roll:people.retry")}
            variant="ghost"
            fullWidth={false}
            className="-ml-2"
            onPress={screen.onRetry}
          />
        </View>
      ) : (
        <ScrollView
          className="flex-1"
          contentContainerClassName="px-5 pb-10 pt-4"
          refreshControl={
            <RefreshControl refreshing={screen.refreshing} onRefresh={screen.onRefresh} tintColor={colorTokens.edge} />
          }
        >
          <Display>{t("roll:people.title")}</Display>
          <View className="mb-2 mt-3">
            <RollCapacity members={event.usage.members} limit={event.limits.members} plan={event.plan} />
          </View>
          <RollPeopleList
            participants={screen.participants}
            currentUserId={screen.currentUserId}
            onPerson={screen.onOpenPerson}
          />
          {screen.removed > 0 ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t("roll:people.removedLabel", { count: screen.removed })}
              onPress={screen.onOpenRemoved}
              className="min-h-12 justify-center pt-2 active:opacity-60"
            >
              <EdgePrint tone="text">{t("roll:people.removed", { count: screen.removed })}</EdgePrint>
            </Pressable>
          ) : null}
        </ScrollView>
      )}

      {screen.notice ? (
        <View pointerEvents="none" className="absolute bottom-12 left-5 right-5 items-center">
          <EdgePrint accessibilityLiveRegion="polite" tone="text" className="bg-sheet px-3 py-2 text-center">
            {screen.notice}
          </EdgePrint>
        </View>
      ) : null}

      <FilmGrain />
      <RollCallSheets screen={screen} />
    </SafeAreaView>
  );
};

/** Someone's actions, and the slips they lead to, in one sheet. */
const RollCallSheets = ({ screen }: { screen: ReturnType<typeof useRollCallScreen> }) => {
  const { t } = useTranslation("roll");
  const { person } = screen;
  const name = person?.name || t("people.unknown");

  return (
    <BottomSheet
      testID="roll-call-dialog"
      visible={screen.sheet !== null && person !== null}
      onClose={screen.onCloseSheet}
      onClosed={screen.onSheetClosed}
    >
      {person && screen.sheet === "person" ? (
        <PersonMenu
          person={person}
          roleLabel={t(ROLE_KEY[person.accessLevel])}
          showFrames={screen.countsFrames}
          onChangeRole={screen.canChangeRole ? screen.onChangeRole : undefined}
          onReport={screen.onReport}
          onBlock={screen.onBlock}
          onUnblock={screen.onUnblock}
          onRemove={screen.canRemove ? screen.onRemove : undefined}
        />
      ) : null}

      {person && screen.sheet === "role" ? (
        <ChangeRoleSlip
          name={name}
          current={person.accessLevel}
          busy={screen.isChangingRole}
          error={screen.slipError}
          onSave={screen.onSaveRole}
        />
      ) : null}

      {person && screen.sheet === "remove" ? (
        <RemovePersonSlip
          name={name}
          frameCount={person.photoCount}
          busy={screen.isRemoving}
          onConfirm={screen.onConfirmRemove}
          onCancel={screen.onBackToPerson}
        />
      ) : null}

      {person && screen.sheet === "block" ? (
        <BlockSlip
          name={name}
          busy={screen.isBlocking}
          error={screen.slipError}
          onConfirm={screen.onConfirmBlock}
          onCancel={screen.onBackToPerson}
        />
      ) : null}

      {screen.sheet === "lastHost" ? (
        <LastHostSlip onChooseHost={screen.onChooseHost} onCancel={screen.onCloseSheet} />
      ) : null}
    </BottomSheet>
  );
};

export default RollCallScreen;
