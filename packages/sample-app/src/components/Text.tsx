import { Text, type TextProps } from "@deloop/ui";

type DemoTextProps = Omit<TextProps, "children">;

export default function TextDemo(props: DemoTextProps) {
  return <Text {...props}>The quick brown fox jumps over the lazy dog</Text>;
}
