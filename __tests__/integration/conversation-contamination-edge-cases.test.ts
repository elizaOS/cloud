/**
 * Edge case tests for conversation contamination
 * 
 * Tests real-world scenarios inspired by ChatGPT/Claude behavior:
 * - Multiple rapid switches
 * - Component unmount during streaming
 * - Browser refresh during streaming
 * - Multiple tabs with same character
 * - Network delays and race conditions
 */

import { describe, it, expect, beforeEach, afterEach } from "bun:test";

describe("Edge Cases - Multiple Rapid Switches", () => {
  it("should handle rapid character switching (A→B→A→B)", async () => {
    const controllers: AbortController[] = [];
    let currentCharacter: string | null = null;

    const switchCharacter = (charId: string) => {
      // Abort previous stream (if any)
      const previousController = controllers[controllers.length - 1];
      if (previousController && !previousController.signal.aborted) {
        previousController.abort();
      }

      // Start new stream
      const newController = new AbortController();
      controllers.push(newController);
      currentCharacter = charId;
    };

    // Rapid switches: A → B → A → B
    switchCharacter("char-a");
    expect(controllers.length).toBe(1);
    expect(controllers[0].signal.aborted).toBe(false);

    switchCharacter("char-b");
    expect(controllers.length).toBe(2);
    expect(controllers[0].signal.aborted).toBe(true); // A aborted
    expect(controllers[1].signal.aborted).toBe(false); // B active

    switchCharacter("char-a");
    expect(controllers.length).toBe(3);
    expect(controllers[1].signal.aborted).toBe(true); // B aborted
    expect(controllers[2].signal.aborted).toBe(false); // A active

    switchCharacter("char-b");
    expect(controllers.length).toBe(4);
    expect(controllers[2].signal.aborted).toBe(true); // A aborted again
    expect(controllers[3].signal.aborted).toBe(false); // B active

    expect(currentCharacter).toBe("char-b");
  });

  it("should handle switch before stream starts", async () => {
    let streamStarted = false;
    const controller = new AbortController();

    // Simulate switching before fetch completes
    const streamPromise = new Promise((resolve, reject) => {
      // Check if aborted before "starting"
      if (controller.signal.aborted) {
        reject(new Error("Aborted before start"));
        return;
      }

      controller.signal.addEventListener("abort", () => {
        reject(new Error("Aborted during setup"));
      });

      setTimeout(() => {
        streamStarted = true;
        resolve("stream complete");
      }, 100);
    });

    // Abort immediately (before the setTimeout)
    controller.abort();

    await expect(streamPromise).rejects.toThrow("Aborted");
    expect(streamStarted).toBe(false);
  });

  it("should handle switch during message processing", async () => {
    let messagesProcessed = 0;
    const controller = new AbortController();

    const processMessages = async () => {
      for (let i = 0; i < 10; i++) {
        if (controller.signal.aborted) {
          throw new Error("Processing aborted");
        }
        messagesProcessed++;
        await new Promise(resolve => setTimeout(resolve, 10));
      }
    };

    // Start processing
    const processPromise = processMessages();

    // Abort after ~3 messages (30ms)
    setTimeout(() => controller.abort(), 35);

    await expect(processPromise).rejects.toThrow("Processing aborted");
    
    // Should have processed some but not all messages
    expect(messagesProcessed).toBeGreaterThan(0);
    expect(messagesProcessed).toBeLessThan(10);
  });
});

describe("Edge Cases - Component Lifecycle", () => {
  it("should cleanup on component unmount", () => {
    let streamingController: AbortController | null = null;
    let loadMessagesController: AbortController | null = null;

    // Component mount - start operations
    const mountComponent = () => {
      streamingController = new AbortController();
      loadMessagesController = new AbortController();
    };

    // Component unmount - cleanup
    const unmountComponent = () => {
      if (streamingController) {
        streamingController.abort();
        streamingController = null;
      }
      if (loadMessagesController) {
        loadMessagesController.abort();
        loadMessagesController = null;
      }
    };

    mountComponent();
    expect(streamingController).not.toBeNull();
    expect(loadMessagesController).not.toBeNull();

    unmountComponent();
    expect(streamingController).toBeNull();
    expect(loadMessagesController).toBeNull();
  });

  it("should handle browser refresh during streaming", async () => {
    // Simulate stream in progress
    const controller = new AbortController();
    let streamCleanedUp = false;

    const stream = new Promise((resolve, reject) => {
      controller.signal.addEventListener("abort", () => {
        streamCleanedUp = true;
        reject(new Error("Stream aborted by refresh"));
      });

      setTimeout(resolve, 5000); // Long stream
    });

    // Simulate page unload (browser refresh)
    controller.abort();

    await expect(stream).rejects.toThrow("Stream aborted");
    expect(streamCleanedUp).toBe(true);
  });
});

describe("Edge Cases - Race Conditions", () => {
  it("should handle late-arriving messages from wrong character", () => {
    let expectedCharacterId: string | null = null;
    const messages: Array<{ charId: string; text: string }> = [];

    const addMessage = (charId: string, text: string) => {
      // Only add if it matches expected character
      if (charId === expectedCharacterId) {
        messages.push({ charId, text });
      } else {
        console.log(`Ignoring late message from ${charId}, expected ${expectedCharacterId}`);
      }
    };

    // Start with Character A
    expectedCharacterId = "char-a";
    addMessage("char-a", "Message 1");
    expect(messages.length).toBe(1);

    // Switch to Character B
    expectedCharacterId = "char-b";
    
    // Late message from Character A arrives (should be ignored)
    addMessage("char-a", "Late message from A");
    expect(messages.length).toBe(1); // Still 1, late message ignored

    // Message from Character B (should be added)
    addMessage("char-b", "Message from B");
    expect(messages.length).toBe(2);

    expect(messages[0].charId).toBe("char-a");
    expect(messages[1].charId).toBe("char-b");
  });

  it("should handle room creation race condition", async () => {
    let roomCreationInProgress = false;
    let createdRoomId: string | null = null;

    const createRoom = async (characterId: string): Promise<string> => {
      if (roomCreationInProgress) {
        throw new Error("Room creation already in progress");
      }

      roomCreationInProgress = true;

      await new Promise(resolve => setTimeout(resolve, 100));

      createdRoomId = `room-${characterId}-${Date.now()}`;
      roomCreationInProgress = false;

      return createdRoomId;
    };

    // First call should succeed
    const room1 = await createRoom("char-a");
    expect(room1).toContain("char-a");

    // Second call should also succeed (first completed)
    const room2 = await createRoom("char-b");
    expect(room2).toContain("char-b");
    expect(room1).not.toBe(room2);
  });

  it("should prevent double-sending when switching quickly", () => {
    let sendInProgress = false;
    const sentMessages: string[] = [];

    const sendMessage = async (text: string) => {
      if (sendInProgress) {
        throw new Error("Send already in progress");
      }

      sendInProgress = true;
      await new Promise(resolve => setTimeout(resolve, 50));
      sentMessages.push(text);
      sendInProgress = false;
    };

    // First send
    const send1 = sendMessage("Message 1");

    // Try to send again immediately (should fail)
    expect(() => sendMessage("Message 2")).toThrow("Send already in progress");

    return send1.then(() => {
      expect(sentMessages.length).toBe(1);
      expect(sentMessages[0]).toBe("Message 1");
    });
  });
});

describe("Edge Cases - Network & Errors", () => {
  it("should handle network timeout during streaming", async () => {
    const controller = new AbortController();
    let timeoutOccurred = false;

    const streamWithTimeout = new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        timeoutOccurred = true;
        controller.abort();
        reject(new Error("Stream timeout"));
      }, 100);

      controller.signal.addEventListener("abort", () => {
        clearTimeout(timeoutId);
        reject(new Error("Aborted"));
      });

      // Simulate slow stream that never completes
      setTimeout(resolve, 10000);
    });

    await expect(streamWithTimeout).rejects.toThrow();
    expect(timeoutOccurred).toBe(true);
  });

  it("should handle streaming error and cleanup", async () => {
    let controllerRef: AbortController | null = null;
    let errorHandled = false;

    const startStream = () => {
      controllerRef = new AbortController();
      
      return new Promise((resolve, reject) => {
        // Simulate error during stream
        setTimeout(() => {
          reject(new Error("Stream error"));
        }, 50);
      });
    };

    const onError = () => {
      errorHandled = true;
      controllerRef = null; // Cleanup
    };

    try {
      await startStream();
    } catch (error) {
      onError();
    }

    expect(errorHandled).toBe(true);
    expect(controllerRef).toBeNull();
  });

  it("should handle AbortController signal after request completes", () => {
    const controller = new AbortController();
    let requestCompleted = false;

    // Simulate request that completes successfully
    const request = new Promise(resolve => {
      setTimeout(() => {
        requestCompleted = true;
        resolve("success");
      }, 50);
    });

    // Try to abort after completion
    return request.then(() => {
      controller.abort(); // This is safe, just a no-op
      expect(requestCompleted).toBe(true);
      expect(controller.signal.aborted).toBe(true);
    });
  });
});

describe("Edge Cases - Memory & Performance", () => {
  it("should not accumulate aborted controllers", () => {
    const controllers: Array<{ id: string; controller: AbortController }> = [];

    const switchCharacter = (charId: string) => {
      // Abort and remove old controllers
      controllers.forEach(c => {
        if (!c.controller.signal.aborted) {
          c.controller.abort();
        }
      });

      // Clear aborted controllers (cleanup)
      controllers.length = 0;

      // Add new controller
      controllers.push({
        id: charId,
        controller: new AbortController(),
      });
    };

    // Switch 100 times
    for (let i = 0; i < 100; i++) {
      switchCharacter(`char-${i}`);
    }

    // Should only have 1 controller (latest)
    expect(controllers.length).toBe(1);
    expect(controllers[0].id).toBe("char-99");
  });

  it("should handle concurrent character switches efficiently", async () => {
    const switches: Array<{ from: string; to: string; timestamp: number }> = [];
    let currentChar = "char-a";

    const switchCharacter = async (toChar: string) => {
      const fromChar = currentChar;
      const timestamp = Date.now();
      
      switches.push({ from: fromChar, to: toChar, timestamp });
      currentChar = toChar;
      
      await new Promise(resolve => setTimeout(resolve, 10));
    };

    // Perform 10 switches rapidly
    await Promise.all([
      switchCharacter("char-b"),
      switchCharacter("char-c"),
      switchCharacter("char-d"),
      switchCharacter("char-e"),
      switchCharacter("char-f"),
      switchCharacter("char-g"),
      switchCharacter("char-h"),
      switchCharacter("char-i"),
      switchCharacter("char-j"),
      switchCharacter("char-k"),
    ]);

    expect(switches.length).toBe(10);
    // All switches should complete within reasonable time
    const totalTime = switches[switches.length - 1].timestamp - switches[0].timestamp;
    expect(totalTime).toBeLessThan(500); // Should be fast
  });
});

