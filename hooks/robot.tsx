import type { ElementTable } from "claude-code";

import { spinner } from "./format";

/** Mini Clawd from the Claude Code welcome screen: head and body, two rows of 5 cells. */
const IDLE = ["▐▛█▜▌", "▝▜█▛▘"];
const BLINK = ["▐███▌", "▝▜█▛▘"];
/** While working it waves its arms and darts its eyes; the fourth frame blinks. */
const WORKING = [
  ["▐▛█▜▌", "▝▜█▛▘"],
  ["▐▛█▜▌", "▗▟█▙▖"],
  ["▐▜█▛▌", "▝▜█▛▘"],
  ["▐███▌", "▗▟█▙▖"],
];

export type RobotProps = {
  isWorking: boolean;
  /** Frame counter; while working it grows four times per second. */
  frame: number;
  /** Current time in milliseconds; when idle the robot blinks once every few seconds. */
  now: number;
};

/** Animated mini robot next to the limits: works while a turn is running, otherwise stands still and blinks now and then. */
export function renderRobot(el: ElementTable, p: RobotProps) {
  const { Box, Text } = el;
  const isBlink = Math.floor(p.now / 1000) % 6 === 0;
  const rows = p.isWorking
    ? (WORKING[p.frame % WORKING.length] ?? IDLE)
    : isBlink
      ? BLINK
      : IDLE;
  const spin = p.isWorking ? spinner(p.frame) : " ";
  // In color only while working; at rest it stays in the background.
  const color = p.isWorking ? "claude" : undefined;

  return (
    <Box flexDirection="column">
      <Text color={color} dimColor={!p.isWorking}>
        {rows[0]}
      </Text>
      <Text color={color} dimColor={!p.isWorking}>
        {rows[1]} {spin}
      </Text>
    </Box>
  );
}
