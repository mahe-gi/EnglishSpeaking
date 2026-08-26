import React from "react";
import {
  TouchableOpacity,
  TouchableOpacityProps,
  View,
  ViewProps,
  StyleSheet,
  ViewStyle,
} from "react-native";
import { colors, radius, spacing, shadows } from "../theme";

export interface CardProps {
  children?: React.ReactNode;
  onPress?: () => void;
  elevated?: boolean;
  highlighted?: boolean;
  style?: ViewStyle | (ViewStyle | false | undefined)[];
  accessibilityRole?: "button" | "none";
  accessibilityLabel?: string;
  testID?: string;
}

export const Card: React.FC<CardProps> = ({
  children,
  onPress,
  elevated = false,
  highlighted = false,
  style,
  accessibilityRole,
  accessibilityLabel,
  testID,
}) => {
  const cardStyle = [
    styles.card,
    elevated && shadows.subtle,
    highlighted && styles.highlighted,
    style,
  ];

  if (onPress) {
    return (
      <TouchableOpacity
        activeOpacity={0.7}
        onPress={onPress}
        style={cardStyle}
        accessibilityRole={accessibilityRole || "button"}
        accessibilityLabel={accessibilityLabel}
        testID={testID}
      >
        {children}
      </TouchableOpacity>
    );
  }

  return (
    <View
      style={cardStyle}
      accessibilityRole={accessibilityRole}
      accessibilityLabel={accessibilityLabel}
      testID={testID}
    >
      {children}
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  highlighted: {
    borderColor: colors.brand,
  },
});
