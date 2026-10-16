import birthday01 from "@/assets/images/welcome/birthday-01.jpg";
import birthday03 from "@/assets/images/welcome/birthday-03.jpg";
import birthday05 from "@/assets/images/welcome/birthday-05.jpg";
import nightout01 from "@/assets/images/welcome/nightout-01.jpg";
import nightout03 from "@/assets/images/welcome/nightout-03.jpg";
import trip02 from "@/assets/images/welcome/trip-02.jpg";
import trip03 from "@/assets/images/welcome/trip-03.jpg";
import wedding04 from "@/assets/images/welcome/wedding-04.jpg";
import wedding06 from "@/assets/images/welcome/wedding-06.jpg";
import wedding09 from "@/assets/images/welcome/wedding-09.jpg";
import wedding11 from "@/assets/images/welcome/wedding-11.jpg";
import { BottomSheet } from "@/components/ui/bottom-sheet/bottom-sheet";
import { Button } from "@/components/ui/button";
import { Display, Wordmark } from "@/components/ui/display";
import { EdgePrint } from "@/components/ui/edge-print";
import { FilmGrain } from "@/components/ui/film-grain";
import { FilmStrip } from "@/components/ui/film-strip";
import { GreasePencil } from "@/components/ui/grease-pencil";
import { PencilNote } from "@/components/ui/pencil-note";
import { SafeAreaView } from "@/components/ui/safe-area-view";
import { Slip } from "@/components/ui/slip";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { View, type LayoutChangeEvent, type LayoutRectangle } from "react-native";
import { useWelcomeScreen } from "../hooks/use-welcome-screen";

// Film edge numbering: decorative, the same in every language.
const EDGE_TOP = "Everglow 400   ▸ 12   12A   ▸ 13   13A   ▸ 14   14A   ▸ 15";
const EDGE_BOTTOM = "▸ 24   24A   ▸ 25   25A   Everglow 400   ▸ 26   26A";

// The strip's geometry (FilmStrip): 13pt of film base above the frames,
// frames 4pt apart inside 4pt of side margin, an 11:9 frame.
const STRIP_BASE = 13;
const FRAME_GAP = 4;
const FRAME_RATIO = 11 / 9;
const PENCIL = 3;

type Box = Pick<LayoutRectangle, "x" | "y" | "width" | "height">;
const layoutOf = (event: LayoutChangeEvent): Box => event.nativeEvent.layout;

/**
 * 01.2 Welcome: the contact sheet is the pitch. A night's photos as three
 * strips laid askew, running off both edges. In pencil, a ring around one
 * photo in the middle strip and a curved arrow up to it from the note. (The
 * drawing puts the ring between two frames; here it sits on a photo.)
 */
const WelcomeScreen = () => {
  const { t } = useTranslation("start");
  const { isLoading, onStart, onSignIn, showSignedOut, onDismissSignedOut, onSignInAgain } = useWelcomeScreen();
  const [sheet, setSheet] = useState<Box | null>(null);
  const [middleStrip, setMiddleStrip] = useState<Box | null>(null);
  const [noteRow, setNoteRow] = useState<Box | null>(null);
  const [note, setNote] = useState<Box | null>(null);

  // The ring circles the middle strip's third frame, the one fully on screen.
  const ring = (() => {
    if (!sheet || !middleStrip) return null;
    const frameWidth = (sheet.width - 2 * FRAME_GAP - 3 * FRAME_GAP) / 4;
    const frameHeight = frameWidth / FRAME_RATIO;
    const cx = FRAME_GAP + 2 * (frameWidth + FRAME_GAP) + frameWidth / 2;
    const cy = middleStrip.y + STRIP_BASE + frameHeight / 2;
    const [rx, ry] = [frameWidth * 0.5 + 6, frameHeight * 0.5 + 8];
    return { cx, cy, rx, ry };
  })();

  // The arrow leaves the end of the note and lands under the ring.
  const arrow =
    ring && noteRow && note
      ? {
          from: [note.x + note.width * 0.92, noteRow.y + note.y - 2] as [number, number],
          to: [ring.cx - 6, ring.cy + ring.ry + 6] as [number, number],
        }
      : null;

  return (
    <SafeAreaView className="flex-1 overflow-hidden bg-ground">
      <View className="z-10 h-11 flex-row items-center justify-between px-5">
        <Wordmark />
        <Button
          title={t("welcome.signIn")}
          variant="ghost"
          fullWidth={false}
          onPress={onSignIn}
          disabled={isLoading}
          testID="login-submit"
        />
      </View>

      <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" className="flex-1">
        <View
          onLayout={(event) => setSheet(layoutOf(event))}
          className="absolute -left-11.5 -right-11.5 top-8 -rotate-5 gap-2.5"
        >
          <EdgePrint numberOfLines={1} ellipsizeMode="clip" className="px-15 opacity-80">
            {EDGE_TOP}
          </EdgePrint>
          <FilmStrip
            frames={[
              { key: "a", image: wedding09 },
              { key: "b", image: nightout03 },
              { key: "c", caption: t("welcome.caption") },
              { key: "d", image: birthday03 },
            ]}
          />
          <View onLayout={(event) => setMiddleStrip(layoutOf(event))}>
            <FilmStrip
              frames={[
                { key: "e", image: birthday01 },
                { key: "f", image: wedding04 },
                { key: "g", image: trip02 },
                { key: "h", image: nightout01 },
              ]}
            />
          </View>
          <FilmStrip
            frames={[
              { key: "i", image: wedding11 },
              { key: "j", image: birthday05 },
              { key: "k", image: trip03 },
              { key: "l", image: wedding06 },
            ]}
          />
          <EdgePrint numberOfLines={1} ellipsizeMode="clip" className="px-15 opacity-80">
            {EDGE_BOTTOM}
          </EdgePrint>
          <View onLayout={(event) => setNoteRow(layoutOf(event))} className="h-16">
            <View onLayout={(event) => setNote(layoutOf(event))} className="absolute left-35.5 top-6 rotate-1">
              <PencilNote>{t("welcome.note")}</PencilNote>
            </View>
          </View>

          {ring ? (
            <View
              className="absolute"
              style={{ left: ring.cx - ring.rx - 2 * PENCIL, top: ring.cy - ring.ry - 2 * PENCIL }}
            >
              <GreasePencil
                mark="ring"
                width={2 * (ring.rx + 2 * PENCIL)}
                height={2 * (ring.ry + 2 * PENCIL)}
                seed={3}
                drawOn
              />
            </View>
          ) : null}
          {sheet && arrow ? (
            <View className="absolute inset-0">
              <GreasePencil
                mark="arrow"
                width={sheet.width}
                height={sheet.height}
                from={arrow.from}
                to={arrow.to}
                bend={0.17}
                strokeWidth={2.8}
                seed={5}
                drawOn
              />
            </View>
          ) : null}
        </View>
      </View>

      <View className="gap-3.5 px-5 pb-1">
        <Display dim={t("welcome.titleDim")} className="mb-2">
          {t("welcome.title")}
        </Display>
        <Button title={t("welcome.start")} mark="▸" onPress={onStart} isLoading={isLoading} />
      </View>
      <FilmGrain />

      <BottomSheet visible={showSignedOut} onClose={onDismissSignedOut}>
        <Slip edge={t("signedOut.edge")} title={t("signedOut.title")} body={t("signedOut.body")}>
          <Button title={t("signedOut.signIn")} mark="▸" onPress={onSignInAgain} />
        </Slip>
      </BottomSheet>
    </SafeAreaView>
  );
};

export default WelcomeScreen;
