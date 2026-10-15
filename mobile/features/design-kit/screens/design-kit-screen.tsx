import { CantConnectScreen } from "@/components/cant-connect-screen";
import { LaunchScreen } from "@/components/launch-screen";
import { AppIcon } from "@/components/ui/app-icon";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { ContactFrame } from "@/components/ui/contact-frame";
import { Display, Wordmark } from "@/components/ui/display";
import { EdgePrint, EdgeValue } from "@/components/ui/edge-print";
import { FilmBox } from "@/components/ui/film-box";
import { FilmGrain } from "@/components/ui/film-grain";
import { FilmStrip } from "@/components/ui/film-strip";
import { FrameCounter } from "@/components/ui/frame-counter";
import { GreasePencil } from "@/components/ui/grease-pencil";
import { IconButton } from "@/components/ui/icon-button";
import { LabCard } from "@/components/ui/lab-card";
import { LabEnvelope } from "@/components/ui/lab-envelope";
import { LabTicket } from "@/components/ui/lab-ticket";
import { OptionRow } from "@/components/ui/option-row";
import { PencilNote } from "@/components/ui/pencil-note";
import { RollCallRow } from "@/components/ui/roll-call-row";
import { SafeAreaView } from "@/components/ui/safe-area-view";
import { Shutter } from "@/components/ui/shutter";
import { Slip } from "@/components/ui/slip";
import { Stamp } from "@/components/ui/stamp";
import { ThemedText } from "@/components/ui/themed-text";
import { colorTokens } from "@/theme/tokens";
import { Redirect, useLocalSearchParams } from "expo-router";
import { CaretLeft, DotsThree, QrCode } from "phosphor-react-native";
import { type ReactNode } from "react";
import { ScrollView, View } from "react-native";

/*
 * Development-only gallery of the contact-sheet components, for checking them
 * against the design system on a device. Open everglowmobile://design-kit, or
 * everglowmobile://design-kit?only=<section title> for one section, or
 * ?screen=launch|cant-connect for an app-wide screen that is hard to reach.
 * The copy is sample data, so it is not translated. Photos come from
 * picsum.photos, so the film sections need a network connection.
 */

const Section = ({ title, only, children }: { title: string; only?: string; children: ReactNode }) =>
  only && only.toLowerCase() !== title.toLowerCase() ? null : (
    <View className="gap-4 border-t border-line pt-4">
      <EdgePrint>{title}</EdgePrint>
      {children}
    </View>
  );

const MARKS = ["ring", "tick", "cross", "underline", "strike"] as const;

const photo = (seed: number) => `https://picsum.photos/seed/everglow${seed}/400/400`;
const PEOPLE = [
  ["Sam Rivera", "Host"],
  ["Leila Haddad", "Adds photos"],
  ["Marcus Bell", "View only"],
] as const;

const DesignKitScreen = () => {
  const { only, screen } = useLocalSearchParams<{ only?: string; screen?: string }>();
  if (!__DEV__) return <Redirect href="/" />;
  if (screen === "launch") return <LaunchScreen />;
  if (screen === "cant-connect") return <CantConnectScreen onRetry={() => undefined} isRetrying={false} />;

  const text = colorTokens.dark.text;

  return (
    <SafeAreaView className="flex-1 bg-ground">
      <ScrollView contentContainerClassName="gap-8 px-5 pb-16 pt-4">
        <View className="flex-row items-center justify-between">
          <IconButton accessibilityLabel="Back">
            <AppIcon icon={CaretLeft} size="sm" color={text} />
          </IconButton>
          <Wordmark />
          <IconButton accessibilityLabel="Scan">
            <AppIcon icon={QrCode} size="sm" color={text} />
          </IconButton>
        </View>

        <Section title="Display" only={only}>
          <Display variant="event">Sam &amp; Jo’s wedding</Display>
          <Display dim="are in use.">Both rolls</Display>
          <Display variant="roll">Nadia turns 30</Display>
        </Section>

        <Section title="Text and edge print" only={only}>
          <ThemedText className="text-body">Everyone’s photos land in the same place.</ThemedText>
          <ThemedText tone="muted" className="text-body">
            A free account runs two rolls at a time.
          </ThemedText>
          <EdgePrint>
            <EdgeValue>1.2</EdgeValue> / 3 GB · <EdgeValue>5h 42m</EdgeValue> left · <EdgeValue>24</EdgeValue> people
          </EdgePrint>
          <EdgePrint size="frame-label">144 · Leila</EdgePrint>
          <PencilNote>free on 14 Nov ↑</PencilNote>
        </Section>

        <Section title="Leaders" only={only}>
          <Button title="Load the roll" mark="▸" />
          <Button title="Keep them" variant="outline" mark="‹" />
          <Button title="Cut and remove 148" variant="danger" mark="▸" />
          <Button title="Not now" variant="ghost" />
          <Button title="Saving" isLoading />
          <Button title="Load the roll" mark="▸" disabled />
        </Section>

        <Section title="Icon buttons" only={only}>
          <View className="flex-row gap-3">
            <IconButton accessibilityLabel="Back">
              <AppIcon icon={CaretLeft} size="sm" color={text} />
            </IconButton>
            <IconButton accessibilityLabel="More">
              <AppIcon icon={DotsThree} size="sm" color={text} />
            </IconButton>
          </View>
        </Section>

        <Section title="Grease pencil" only={only}>
          <View className="flex-row flex-wrap gap-4">
            {MARKS.map((mark, index) => (
              <View key={mark} className="items-center gap-2">
                <View className="h-16 w-24 items-center justify-center bg-frame-empty">
                  <GreasePencil mark={mark} width={96} height={64} seed={index + 1} drawOn />
                </View>
                <EdgePrint size="frame-label">{mark}</EdgePrint>
              </View>
            ))}
          </View>
        </Section>

        <Section title="Film" only={only}>
          <FilmStrip
            frames={[
              { key: "a", uri: photo(1) },
              { key: "b", uri: photo(2) },
              { key: "c", uri: photo(3), dim: true },
              { key: "d", number: 4 },
            ]}
          />
          <View className="flex-row flex-wrap gap-y-3.5">
            {[144, 145, 146, 147, 148, 149].map((n, i) => (
              <View key={n} className="w-1/3 px-0.5">
                <ContactFrame
                  uri={photo(n)}
                  number={n}
                  by={["Leila", "Sam", "Jo"][i % 3]}
                  selected={i === 1}
                  isNew={i === 3}
                  accessibilityLabel={`Frame ${n}`}
                />
              </View>
            ))}
          </View>
          <View className="flex-row gap-2">
            {[3, 7, 14, 30].map((days) => (
              <FilmBox
                key={days}
                days={days}
                label="day roll"
                selected={days === 7}
                accessibilityLabel={`${days}-day roll`}
              />
            ))}
          </View>
          <View className="flex-row items-end justify-around pt-2">
            <Shutter accessibilityLabel="Add photos" label="Add photos" />
            <Shutter accessibilityLabel="Add photos" label="Opens Sun" disabled />
          </View>
        </Section>

        <Section title="Counter" only={only}>
          <FrameCounter count={12} label="Frames on the roll" accessibilityLabel="12 frames on the roll" />
        </Section>

        <Section title="Paper" only={only}>
          <View className="pb-4">
            <LabEnvelope
              title="Everglow photo lab"
              number="No. 0418"
              fields={[
                { label: "Name", value: "Sam & Jo’s wedding" },
                { label: "Date", value: "Sun 18 Oct, 4 pm" },
                { label: "On the roll", value: "24 people so far" },
                { label: "Pick up by", value: "17 Nov, then it’s gone" },
              ]}
              options={[
                { label: "Adds photos", checked: true },
                { label: "View only", checked: false },
              ]}
              footer="Scan with any camera"
              accessibilityLabel="Invite to Sam and Jo’s wedding"
            />
            <View className="absolute -bottom-2 right-4">
              <Stamp title="Join" subtitle="The roll" />
            </View>
          </View>
          <LabTicket
            title="Report a frame"
            number="Frame 144"
            options={[
              { key: "spam", label: "Spam or a mistake", checked: false },
              { key: "rude", label: "Rude or hurtful", checked: true },
              { key: "nudity", label: "Nudity", checked: false },
              { key: "child", label: "Involves a minor", checked: false },
            ]}
            divider={{ afterKey: "nudity", label: "Goes straight to Everglow" }}
            footer="Anonymous to hosts."
          />
        </Section>

        <Section title="Card" only={only}>
          <LabCard
            title="Lab card · since Oct 2026"
            photoUri={photo(40)}
            fields={[
              { label: "Name", value: "Maya Chen" },
              { label: "Signs as", value: "@maya.chen" },
              { label: "Free roll", value: "1 of 2 running" },
            ]}
            accessibilityLabel="Maya Chen, @maya.chen"
          />
        </Section>

        <Section title="Lists" only={only}>
          <View>
            {PEOPLE.map(([name, role], i) => (
              <RollCallRow
                key={name}
                number={i + 1}
                name={name}
                roleLabel={role}
                avatar={<Avatar userId={name} name={name} uri={photo(60 + i)} />}
              />
            ))}
            <RollCallRow
              number={4}
              name="Dan Ruiz"
              roleLabel="Removed"
              gone
              avatar={<Avatar userId="dan" name="Dan Ruiz" uri={null} />}
            />
          </View>
          <View accessibilityRole="radiogroup">
            <OptionRow title="Keep her frames" description="They stay on the roll, signed by Leila." selected />
            <OptionRow title="Delete them too" description="All 31 are removed for everyone." selected={false} />
          </View>
        </Section>

        <Section title="Slip" only={only}>
          <View className="border-t-2 border-text bg-sheet px-5 pb-6 pt-5">
            <Slip
              edge="Frame 144 · by Leila"
              title="Delete it for everyone?"
              body="Leila and everyone on the roll stop seeing it. This can’t be undone."
            >
              <Button title="Delete frame 144" variant="danger" />
              <Button title="Keep it" variant="outline" mark="‹" />
            </Slip>
          </View>
        </Section>
      </ScrollView>
      <FilmGrain />
    </SafeAreaView>
  );
};

export default DesignKitScreen;
