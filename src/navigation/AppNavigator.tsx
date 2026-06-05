/**
 * AppNavigator.tsx  (v2)
 * Navigation container — bottom tabs + stack configuration.
 */

import React from 'react';
import { Text } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';

import HomeScreen            from '../screens/HomeScreen';
import EnrollScreen          from '../screens/EnrollScreen';
import RecognizeScreen       from '../screens/RecognizeScreen';
import AttendanceLogScreen   from '../screens/AttendanceLogScreen';

// ─── Stack param types ────────────────────────────────────────────────────────
export type RootStackParamList = {
  Main: undefined;
};

export type MainTabParamList = {
  Home:     undefined;
  Recognize: undefined;
  Enroll:   undefined;
  Logs:     undefined;
};

// ─── Icon helper ──────────────────────────────────────────────────────────────
const TabIcon = ({ emoji, focused }: { emoji: string; focused: boolean }) => (
  <Text style={{ fontSize: 22, opacity: focused ? 1 : 0.45 }}>{emoji}</Text>
);

// ─── Navigators ────────────────────────────────────────────────────────────────
const Stack = createNativeStackNavigator<RootStackParamList>();
const Tab   = createBottomTabNavigator<MainTabParamList>();

function MainTabs() {
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: '#0D1117',
          borderTopColor: '#1C2833',
          borderTopWidth: 1,
          height: 68,
          paddingBottom: 10,
          paddingTop: 4,
        },
        tabBarActiveTintColor:   '#00E5FF',
        tabBarInactiveTintColor: '#607D8B',
        tabBarLabelStyle: {
          fontSize: 11,
          fontFamily: 'Roboto-Medium',
        },
      }}>
      <Tab.Screen
        name="Home"
        component={HomeScreen}
        options={{
          tabBarLabel: 'Dashboard',
          tabBarIcon: ({ focused }) => <TabIcon emoji="🏠" focused={focused} />,
        }}
      />
      <Tab.Screen
        name="Recognize"
        component={RecognizeScreen}
        options={{
          tabBarLabel: 'Scan Face',
          tabBarIcon: ({ focused }) => <TabIcon emoji="🔍" focused={focused} />,
        }}
      />
      <Tab.Screen
        name="Enroll"
        component={EnrollScreen}
        options={{
          tabBarLabel: 'Enroll',
          tabBarIcon: ({ focused }) => <TabIcon emoji="👤" focused={focused} />,
        }}
      />
      <Tab.Screen
        name="Logs"
        component={AttendanceLogScreen}
        options={{
          tabBarLabel: 'Attendance',
          tabBarIcon: ({ focused }) => <TabIcon emoji="📋" focused={focused} />,
        }}
      />
    </Tab.Navigator>
  );
}

export default function AppNavigator() {
  return (
    <NavigationContainer>
      <Stack.Navigator screenOptions={{ headerShown: false, animation: 'fade' }}>
        <Stack.Screen name="Main" component={MainTabs} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
