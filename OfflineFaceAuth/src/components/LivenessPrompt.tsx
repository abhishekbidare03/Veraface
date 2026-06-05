/**
 * LivenessPrompt.tsx
 * Fullscreen animated challenge prompt component.
 * Shows above camera, with animated icon and countdown ring.
 */

import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Animated,
  Dimensions,
} from 'react-native';
import { LivenessChallenge, CHALLENGE_LABELS } from '../utils/livenessUtils';

const { width: W } = Dimensions.get('window');

interface Props {
  challenge: LivenessChallenge;
  timeLeft: number;      // seconds remaining (0-7)
  totalTime?: number;    // default 7
  completed?: boolean;
}

const CHALLENGE_ICONS: Record<LivenessChallenge, string> = {
  BLINK:      '😉',
  SMILE:      '😊',
  TURN_LEFT:  '👈',
  TURN_RIGHT: '👉',
};

export default function LivenessPrompt({ challenge, timeLeft, totalTime = 7, completed = false }: Props) {
  const progressAnim = useRef(new Animated.Value(1)).current;
  const scaleAnim    = useRef(new Animated.Value(0.8)).current;
  const opacityAnim  = useRef(new Animated.Value(0)).current;

  // Mount animation
  useEffect(() => {
    Animated.parallel([
      Animated.spring(scaleAnim, { toValue: 1, useNativeDriver: true, tension: 120, friction: 8 }),
      Animated.timing(opacityAnim, { toValue: 1, duration: 250, useNativeDriver: true }),
    ]).start();
  }, [scaleAnim, opacityAnim]);

  // Progress ring
  useEffect(() => {
    Animated.timing(progressAnim, {
      toValue: timeLeft / totalTime,
      duration: 900,
      useNativeDriver: false,
    }).start();
  }, [timeLeft, totalTime, progressAnim]);

  const accentColor = completed ? '#4CAF50' : timeLeft <= 2 ? '#F44336' : '#FF9800';

  return (
    <Animated.View style={[styles.container, { opacity: opacityAnim, transform: [{ scale: scaleAnim }] }]}>
      {/* Icon */}
      <Animated.Text style={[styles.icon, completed && styles.iconCompleted]}>
        {completed ? '✅' : CHALLENGE_ICONS[challenge]}
      </Animated.Text>

      {/* Instruction */}
      <Text style={styles.instruction}>
        {completed ? 'Challenge complete!' : CHALLENGE_LABELS[challenge]}
      </Text>

      {/* Timer bar */}
      {!completed && (
        <View style={styles.timerContainer}>
          <View style={styles.timerTrack}>
            <Animated.View
              style={[
                styles.timerFill,
                {
                  backgroundColor: accentColor,
                  width: progressAnim.interpolate({
                    inputRange:  [0, 1],
                    outputRange: ['0%', '100%'],
                  }),
                },
              ]}
            />
          </View>
          <Text style={[styles.timerText, { color: accentColor }]}>{timeLeft}s</Text>
        </View>
      )}

      {/* Urgency hint */}
      {!completed && timeLeft <= 3 && (
        <Text style={[styles.urgencyHint, { color: accentColor }]}>⚡ Hurry!</Text>
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#0D1117F0',
    borderRadius: 20,
    paddingHorizontal: 24,
    paddingVertical: 20,
    alignItems: 'center',
    gap: 12,
    marginHorizontal: 16,
    borderWidth: 1,
    borderColor: '#FF980066',
  },
  icon: {
    fontSize: 48,
  },
  iconCompleted: {
    // scale up on completion
  },
  instruction: {
    color: '#FFFFFF',
    fontFamily: 'Roboto-Bold',
    fontSize: 20,
    textAlign: 'center',
    lineHeight: 26,
  },
  timerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    width: '100%',
  },
  timerTrack: {
    flex: 1,
    height: 8,
    backgroundColor: '#1C2833',
    borderRadius: 4,
    overflow: 'hidden',
  },
  timerFill: {
    height: '100%',
    borderRadius: 4,
  },
  timerText: {
    fontFamily: 'Roboto-Bold',
    fontSize: 16,
    minWidth: 28,
    textAlign: 'right',
  },
  urgencyHint: {
    fontFamily: 'Roboto-Bold',
    fontSize: 14,
    letterSpacing: 1,
  },
});
