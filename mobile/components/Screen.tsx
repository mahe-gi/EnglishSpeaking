import React from "react";
import { View, StyleSheet, ViewStyle } from "react-native";
import { SafeAreaView, SafeAreaViewProps } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";

export interface ScreenProps extends SafeAreaViewProps {
  children: React.ReactNode;
  style?: ViewStyle;
}

export const Screen: React.FC<ScreenProps> = ({
  children,
  style,
  ...props
}) => {
  return (
    <SafeAreaView style={[styles.container, style]} {...props}>
      <StatusBar style="dark" />
      <View style={styles.content}>{children}</View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#FFFFFF",
  },
  content: {
    flex: 1,
    paddingHorizontal: 20,
  },
});
