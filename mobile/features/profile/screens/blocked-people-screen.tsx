import { Button } from "@/components/ui/button";
import { Display } from "@/components/ui/display";
import { FilmGrain } from "@/components/ui/film-grain";
import { SafeAreaView } from "@/components/ui/safe-area-view";
import { BackButton, TopBar } from "@/components/ui/top-bar";
import { useTranslation } from "react-i18next";
import { ScrollView, Text, View } from "react-native";
import { BlockedPersonRow } from "../components/blocked-person-row";
import { useBlockedPeopleScreen } from "../hooks/use-blocked-people-screen";

const RowSkeleton = () => (
  <View className="min-h-14 flex-row items-center gap-3 border-b border-line py-2.5">
    <View className="h-2.5 w-6 rounded-xs bg-sheet" />
    <View className="size-9 rounded-frame bg-sheet" />
    <View className="h-3.5 w-36 rounded-xs bg-sheet" />
  </View>
);

/** 14.8 Blocked people: initials only, since the list of blocks has no photos. */
const BlockedPeopleScreen = () => {
  const { t } = useTranslation(["you", "common"]);
  const { people, count, isLoading, isError, onRetry, onUnblock, onBack } = useBlockedPeopleScreen();

  return (
    <SafeAreaView className="flex-1 bg-ground">
      <TopBar
        title={count === undefined ? t("blocked.edge") : t("blocked.edgeCount", { count })}
        left={<BackButton accessibilityLabel={t("common:actions.back")} onPress={onBack} />}
      />
      <ScrollView className="flex-1" contentContainerClassName="px-5 pb-8 pt-4">
        <Display>{t("blocked.title")}</Display>
        <Text className="mt-3 font-sans text-body text-text-2">{t("blocked.body")}</Text>

        <View className="mt-6">
          {isLoading ? (
            <View testID="blocked-loading">
              <RowSkeleton />
              <RowSkeleton />
            </View>
          ) : isError ? (
            <View className="items-start gap-2">
              <Text className="font-sans text-body text-text-2">{t("blocked.loadFailed")}</Text>
              <Button
                title={t("blocked.retry")}
                variant="ghost"
                fullWidth={false}
                className="-ml-2"
                onPress={onRetry}
              />
            </View>
          ) : people.length === 0 ? (
            <Text className="font-sans text-body text-text-2">{t("blocked.empty")}</Text>
          ) : (
            people.map((person, index) => (
              <BlockedPersonRow
                key={person.userId}
                number={index + 1}
                name={person.name}
                handle={person.handle}
                unblockLabel={t("blocked.unblock")}
                unblockA11y={t("blocked.unblockA11y", { name: person.name })}
                onUnblock={() => onUnblock(person.userId)}
              />
            ))
          )}
        </View>
      </ScrollView>
      <FilmGrain />
    </SafeAreaView>
  );
};

export default BlockedPeopleScreen;
