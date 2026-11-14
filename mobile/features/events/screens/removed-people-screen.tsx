import { Button } from "@/components/ui/button";
import { Display } from "@/components/ui/display";
import { FilmGrain } from "@/components/ui/film-grain";
import { SafeAreaView } from "@/components/ui/safe-area-view";
import { BackButton, TopBar } from "@/components/ui/top-bar";
import { useTranslation } from "react-i18next";
import { ScrollView, Text, View } from "react-native";
import { RemovedPersonRow } from "../components/removed-person-row";
import { useRemovedPeopleScreen } from "../hooks/use-removed-people-screen";

const RowSkeleton = () => (
  <View className="min-h-14 flex-row items-center gap-3 border-b border-line py-2.5">
    <View className="h-2.5 w-6 rounded-xs bg-sheet" />
    <View className="size-9 rounded-frame bg-sheet" />
    <View className="h-3.5 w-36 rounded-xs bg-sheet" />
  </View>
);

/** 11.5 Removed people: initials only, since the list of removed people has no photos. */
const RemovedPeopleScreen = () => {
  const { t } = useTranslation(["roll", "common"]);
  const { people, count, isLoading, isError, onRetry, onLetBack, onBack } = useRemovedPeopleScreen();

  return (
    <SafeAreaView className="flex-1 bg-ground">
      <TopBar
        title={count ? t("removedPeople.edgeCount", { count }) : t("removedPeople.edge")}
        left={<BackButton accessibilityLabel={t("common:actions.back")} onPress={onBack} />}
      />
      <ScrollView className="flex-1" contentContainerClassName="px-5 pb-8 pt-4">
        <Display>{t("removedPeople.title")}</Display>
        <Text className="mt-3 font-sans text-body text-text-2">{t("removedPeople.body")}</Text>

        <View className="mt-6">
          {isLoading ? (
            <View testID="removed-loading" accessibilityLabel={t("removedPeople.loading")}>
              <RowSkeleton />
              <RowSkeleton />
            </View>
          ) : isError ? (
            <View className="items-start gap-2">
              <Text className="font-sans text-body text-text-2">{t("removedPeople.loadFailed")}</Text>
              <Button
                title={t("removedPeople.retry")}
                variant="ghost"
                fullWidth={false}
                className="-ml-2"
                onPress={onRetry}
              />
            </View>
          ) : people.length === 0 ? (
            <Text className="font-sans text-body text-text-2">{t("removedPeople.empty")}</Text>
          ) : (
            people.map((person, index) => (
              <RemovedPersonRow
                key={person.userId}
                number={index + 1}
                name={person.name}
                initials={person.initials}
                letBackLabel={t("removedPeople.letBack")}
                letBackA11y={t("removedPeople.letBackA11y", { name: person.name })}
                onLetBack={() => onLetBack(person.userId)}
              />
            ))
          )}
        </View>
      </ScrollView>
      <FilmGrain />
    </SafeAreaView>
  );
};

export default RemovedPeopleScreen;
