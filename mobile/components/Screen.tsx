import React from "react";
import { View, StyleSheet, ViewStyle } from "react-native";
import { SafeAreaView, SafeAreaViewProps } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { colors, spacing } from "../theme";

export interface ScreenProps extends SafeAreaViewProps {
  children: React.ReactNode;
  style?: ViewStyle | ViewStyle[];
  contentStyle?: ViewStyle | ViewStyle[];
  statusBarStyle?: "dark" | "light" | "auto";
}

export const Screen: React.FC<ScreenProps> = ({
  children,
  style,
  contentStyle,
  statusBarStyle = "dark",
  ...props
}) => {
  return (
    <SafeAreaView style={[styles.container, style]} {...props}>
      <StatusBar style={statusBarStyle} />
      <View style={[styles.content, contentStyle]}>{children}</View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    flex: 1,
    paddingHorizontal: spacing.lg,
  },
});
