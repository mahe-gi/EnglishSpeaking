import React from "react";
import {
  TouchableOpacity,
  TouchableOpacityProps,
  ActivityIndicator,
  StyleSheet,
  ViewStyle,
  View,
} from "react-native";
import { AppText } from "./AppText";
import { colors, radius, spacing } from "../theme";

export interface ButtonProps extends TouchableOpacityProps {
  title: string;
  variant?: "primary" | "secondary" | "outline" | "danger" | "ghost";
  size?: "sm" | "md" | "lg";
  icon?: React.ReactNode;
  loading?: boolean;
  style?: ViewStyle | ViewStyle[];
}

export const Button: React.FC<ButtonProps> = ({
  title,
  variant = "primary",
  size = "md",
  icon,
  loading = false,
  disabled,
  style,
  ...props
}) => {
  const isDisabled = disabled || loading;

  const getTextColor = () => {
    switch (variant) {
      case "primary":
        return colors.textInverse;
      case "secondary":
        return colors.textPrimary;
      case "outline":
        return colors.textPrimary;
      case "danger":
        return colors.textInverse;
      case "ghost":
        return colors.textSecondary;
    }
  };

  return (
    <TouchableOpacity
      activeOpacity={0.8}
      disabled={isDisabled}
      accessibilityRole="button"
      style={[
        styles.base,
        styles[variant],
        styles[size],
        isDisabled && styles.disabled,
        style,
      ]}
      {...props}
    >
      {loading ? (
        <ActivityIndicator color={getTextColor()} size="small" />
      ) : (
        <View style={styles.contentRow}>
          {icon && <View style={styles.iconContainer}>{icon}</View>}
          <AppText
            variant={size === "sm" ? "captionMedium" : "bodyMedium"}
            color={getTextColor()}
          >
            {title}
          </AppText>
        </View>
      )}
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  base: {
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 48,
    minWidth: 44,
  },
  contentRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  },
  iconContainer: {
    marginRight: spacing.xs,
  },
  sm: {
    height: 38,
    minHeight: 38,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.sm,
  },
  md: {
    height: 48,
    paddingHorizontal: spacing.lg,
  },
  lg: {
    height: 54,
    paddingHorizontal: spacing.xl,
    borderRadius: radius.lg,
  },
  primary: {
    backgroundColor: colors.brand,
  },
  secondary: {
    backgroundColor: colors.surfaceMuted,
  },
  outline: {
    backgroundColor: "transparent",
    borderWidth: 1,
    borderColor: colors.border,
  },
  danger: {
    backgroundColor: colors.danger,
  },
  ghost: {
    backgroundColor: "transparent",
  },
  disabled: {
    opacity: 0.45,
  },
});
