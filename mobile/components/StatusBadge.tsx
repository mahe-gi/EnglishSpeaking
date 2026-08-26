import React from "react";
import { View, StyleSheet, ViewStyle } from "react-native";
import { AppText } from "./AppText";
import { colors, radius, spacing } from "../theme";

export interface StatusBadgeProps {
  label: string;
  variant?: "neutral" | "success" | "warning" | "danger" | "accent";
  icon?: React.ReactNode;
  style?: ViewStyle;
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({
  label,
  variant = "neutral",
  icon,
  style,
}) => {
  const getBadgeStyle = () => {
    switch (variant) {
      case "success":
        return { bg: colors.successSubtle, text: colors.success, border: "#A7F3D0" };
      case "warning":
        return { bg: colors.warningSubtle, text: colors.warning, border: "#FDE68A" };
      case "danger":
        return { bg: colors.dangerSubtle, text: colors.danger, border: "#FECACA" };
      case "accent":
        return { bg: colors.accentSubtle, text: colors.accent, border: "#BFDBFE" };
      default:
        return { bg: colors.surfaceMuted, text: colors.textSecondary, border: colors.border };
    }
  };

  const themeColors = getBadgeStyle();

  return (
    <View
      style={[
        styles.badge,
        { backgroundColor: themeColors.bg, borderColor: themeColors.border },
        style,
      ]}
    >
      {icon && <View style={styles.iconContainer}>{icon}</View>}
      <AppText variant="micro" color={themeColors.text}>
        {label}
      </AppText>
    </View>
  );
};

const styles = StyleSheet.create({
  badge: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.xs,
    paddingVertical: 3,
    borderRadius: radius.full,
    borderWidth: 1,
    alignSelf: "flex-start",
  },
  iconContainer: {
    marginRight: 4,
  },
});
