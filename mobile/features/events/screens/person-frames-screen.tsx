import { Button } from "@/components/ui/button";
import { ContactFrame } from "@/components/ui/contact-frame";
import { Display } from "@/components/ui/display";
import { EdgePrint } from "@/components/ui/edge-print";
import { FilmGrain } from "@/components/ui/film-grain";
import { SafeAreaView } from "@/components/ui/safe-area-view";
import { BackButton, TopBar } from "@/components/ui/top-bar";
import { colorTokens } from "@/theme/tokens";
import { useTranslation } from "react-i18next";
import { FlatList, RefreshControl, Text, View } from "react-native";
import { usePersonFramesScreen, type PersonFrame } from "../hooks/use-person-frames-screen";
import { frameSeed } from "../lib/roll-page";

const SKELETON = [1, 2, 3, 4, 5, 6];

/** Empty frames where theirs will be, laid out like the contact sheet. */
const FramesSkeleton = ({ label }: { label: string }) => (
  <View testID="person-frames-loading" accessibilityLabel={label} className="flex-row flex-wrap px-0.5">
    {SKELETON.map((key) => (
      <View key={key} className="w-1/3 px-0.5 pb-3.5">
        <View className="aspect-square w-full rounded-frame bg-frame-empty" />
      </View>
    ))}
  </View>
);

/** Someone's frames on the roll, each with its number on the whole roll. */
const PersonFramesScreen = () => {
  const { t } = useTranslation(["roll", "common"]);
  const screen = usePersonFramesScreen();

  const header = (
    <View className="px-5 pb-4 pt-4">
      <Display>{t("roll:personFrames.title", { name: screen.firstName })}</Display>
      {!screen.isLoading && !screen.isError && screen.frames.length > 0 ? (
        <EdgePrint className="mt-2.5">{t("roll:personFrames.edge", { count: screen.frames.length })}</EdgePrint>
      ) : null}
    </View>
  );

  const renderFrame = ({ item }: { item: PersonFrame }) => (
    <View className="w-1/3 px-0.5 pb-3.5">
      <ContactFrame
        uri={item.photo.thumbnailUrl}
        cacheKey={`photo:${item.photo.id}:thumbnail`}
        number={item.number}
        ringSeed={frameSeed(item.photo.id)}
        accessibilityLabel={t("roll:frame.label", { number: item.number })}
      />
    </View>
  );

  const body = screen.isLoading ? (
    <FramesSkeleton label={t("roll:personFrames.loading", { name: screen.firstName })} />
  ) : screen.isError ? (
    <View className="items-start gap-2 px-5">
      <Text className="font-sans text-body text-text-2">{t("roll:personFrames.loadFailed")}</Text>
      <Button
        title={t("roll:personFrames.retry")}
        variant="ghost"
        fullWidth={false}
        className="-ml-2"
        onPress={screen.onRetry}
      />
    </View>
  ) : (
    <Text className="px-5 font-sans text-body text-text-2">
      {screen.showsFrames ? t("roll:personFrames.empty", { name: screen.firstName }) : t("roll:personFrames.noFrames")}
    </Text>
  );

  const showsSheet = !screen.isLoading && !screen.isError && screen.frames.length > 0;

  return (
    <SafeAreaView className="flex-1 bg-ground">
      <TopBar
        title={screen.name}
        left={<BackButton accessibilityLabel={t("common:actions.back")} onPress={screen.onBack} />}
      />
      <FlatList
        data={showsSheet ? screen.frames : []}
        keyExtractor={(item) => item.photo.id}
        numColumns={3}
        renderItem={renderFrame}
        ListHeaderComponent={header}
        ListEmptyComponent={body}
        columnWrapperClassName="px-0.5"
        contentContainerStyle={{ paddingBottom: 32 }}
        onEndReached={screen.loadMore}
        onEndReachedThreshold={0.5}
        refreshControl={
          <RefreshControl refreshing={screen.refreshing} onRefresh={screen.onRefresh} tintColor={colorTokens.edge} />
        }
      />
      <FilmGrain />
    </SafeAreaView>
  );
};

export default PersonFramesScreen;
