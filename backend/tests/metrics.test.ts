import { describe, it } from "node:test";
import assert from "node:assert";
import {
  tokenizeWords,
  calculateUtteranceMetrics,
  calculateAggregateMetrics,
  HIGH_CONFIDENCE_FILLERS,
} from "../src/services/metrics.service.js";

describe("Metrics Service & Tokenizer", () => {
  describe("tokenizeWords", () => {
    it("should correctly tokenize contractions as single words", () => {
      const tokens1 = tokenizeWords("I'm a developer");
      assert.deepStrictEqual(tokens1, ["i'm", "a", "developer"]);
      assert.strictEqual(tokens1.length, 3);

      const tokens2 = tokenizeWords("don't stop");
      assert.deepStrictEqual(tokens2, ["don't", "stop"]);
      assert.strictEqual(tokens2.length, 2);

      const tokens3 = tokenizeWords("It's we'll they're shouldn't");
      assert.deepStrictEqual(tokens3, ["it's", "we'll", "they're", "shouldn't"]);
    });

    it("should handle punctuation and whitespace around words and fillers", () => {
      const tokens = tokenizeWords("Um, I'm ready... Let's go!");
      assert.deepStrictEqual(tokens, ["um", "i'm", "ready", "let's", "go"]);
      assert.strictEqual(tokens.length, 5);
    });

    it("should support Unicode and Indic-script code-mixing without losing words or splitting matras", () => {
      const tokens = tokenizeWords("నేను developer ని, I work on React projects.");
      assert.deepStrictEqual(tokens, [
        "నేను",
        "developer",
        "ని",
        "i",
        "work",
        "on",
        "react",
        "projects",
      ]);
      assert.strictEqual(tokens.length, 8);
    });

    it("should handle empty or whitespace-only transcript safely", () => {
      assert.deepStrictEqual(tokenizeWords(""), []);
      assert.deepStrictEqual(tokenizeWords("   \n\t  "), []);
    });
  });

  describe("calculateUtteranceMetrics", () => {
    it("should accurately count high-confidence fillers regardless of casing", () => {
      const transcript = "UMM, I uh, worked on this project, ER, last month.";
      const metrics = calculateUtteranceMetrics(transcript, 15000); // 15s

      assert.strictEqual(metrics.wordCount, 10);
      assert.strictEqual(metrics.fillerCount, 3); // umm, uh, er
      assert.strictEqual(metrics.durationSeconds, 15);
      assert.strictEqual(metrics.wordsPerMinute, 40.0); // (10 / 15) * 60 = 40 WPM
      assert.strictEqual(metrics.fillerPercentage, 30.0);
    });

    it("should NOT flag context-sensitive words like 'like' or 'actually' as unconditional fillers", () => {
      const transcript = "I actually like this architecture because it is basically simple.";
      const metrics = calculateUtteranceMetrics(transcript, 10000);

      assert.strictEqual(metrics.wordCount, 10);
      assert.strictEqual(metrics.fillerCount, 0); // none in HIGH_CONFIDENCE_FILLERS
      assert.strictEqual(HIGH_CONFIDENCE_FILLERS.has("like"), false);
      assert.strictEqual(HIGH_CONFIDENCE_FILLERS.has("actually"), false);
    });
  });

  describe("calculateAggregateMetrics", () => {
    it("should calculate aggregate speaking time, average WPM, and delivery score", () => {
      const items = [
        { wordCount: 30, durationSeconds: 15, fillerCount: 1 },
        { wordCount: 40, durationSeconds: 20, fillerCount: 0 },
        { wordCount: 50, durationSeconds: 25, fillerCount: 1 },
      ];

      const aggregate = calculateAggregateMetrics(items);

      assert.strictEqual(aggregate.totalWordCount, 120);
      assert.strictEqual(aggregate.totalSpeakingSeconds, 60);
      assert.strictEqual(aggregate.averageWpm, 120.0); // 120 words in 60s = 120 WPM
      assert.strictEqual(aggregate.totalFillerCount, 2);
      assert.strictEqual(aggregate.aggregateFillerPercentage, 1.7);
      assert(aggregate.deliveryScore >= 80 && aggregate.deliveryScore <= 100);
      assert.strictEqual(aggregate.versionMetadata?.scoringVersion, "baseline-v1");
    });
  });
});
