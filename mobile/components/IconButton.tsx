import React from "react";
import {
  TouchableOpacity,
  TouchableOpacityProps,
  StyleSheet,
  ViewStyle,
  ActivityIndicator,
} from "react-native";
import { colors, radius } from "../theme";

export interface IconButtonProps extends TouchableOpacityProps {
  icon: React.ReactNode;
  size?: number;
  variant?: "default" | "surface" | "brand" | "danger" | "ghost";
  loading?: boolean;
  accessibilityLabel: string;
  style?: ViewStyle | ViewStyle[];
}

export const IconButton: React.FC<IconButtonProps> = ({
  icon,
  size = 48,
  variant = "default",
  loading = false,
  disabled,
  accessibilityLabel,
  style,
  ...props
}) => {
  const isDisabled = disabled || loading;

  return (
    <TouchableOpacity
      activeOpacity={0.7}
      disabled={isDisabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      style={[
        styles.base,
        { width: size, height: size, borderRadius: radius.full },
        styles[variant],
        isDisabled && styles.disabled,
        style,
      ]}
      {...props}
    >
      {loading ? <ActivityIndicator size="small" color={colors.textPrimary} /> : icon}
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  base: {
    alignItems: "center",
    justifyContent: "center",
    minWidth: 44,
    minHeight: 44,
  },
  default: {
    backgroundColor: colors.surfaceMuted,
  },
  surface: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  brand: {
    backgroundColor: colors.brand,
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
