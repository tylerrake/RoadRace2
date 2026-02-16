
import { GoogleGenAI, Type } from "@google/genai";
// Fix: Opponent is the correct exported type from ../types, not Rival.
import { Player, Opponent, RaceState } from "../types";

// Always use the process.env.API_KEY directly for initializing GoogleGenAI.
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

// Fix: Updated rivals parameter type to Opponent[].
export const callAIDecisionEngine = async (
  player: Player,
  rivals: Opponent[],
  raceState: RaceState,
  tick: number
) => {
  const context = {
    player,
    rivals,
    raceState: {
      ...raceState,
      eventLog: raceState.eventLog.slice(-15) // Slightly more history
    },
    tick
  };

  const prompt = `You are the Neural Decision Engine for NEURAL RUSH: LA Underground.
  
  CURRENT GAME STATE:
  ${JSON.stringify(context, null, 2)}
  
  YOUR ROLE:
  You control 4 AI rivals (VIPER, CIPHER, HAVOC, GHOST). 
  
  GOALS:
  1. VIPER: Win at all costs. Hates the player if they block him.
  2. CIPHER: Analyzes heat. Will betray others to lower his own heat.
  3. HAVOC: Pure aggression. Wants to crash whoever is closest.
  4. GHOST: Loyal but fearful. Will follow the player or CIPHER's lead.
  
  DECISION REQUIREMENTS:
  - rivalActions: specific game actions (aggressive_push, defensive_block, nitro_burst, pit_maneuver).
  - emotionalUpdates: Reflect memory of past turns.
  - bountyResponses: How rivals react to active bounties (accept to hunt the target, or decline).
  - policeAction: If heat > 40, police might intercept specific cars.
  - positionChanges: Re-order the 'positions' array (ids: viper, cipher, havoc, ghost, player) based on your logic.
  - commentary: A snarky, high-octane line from one of the rivals.

  RETURN ONLY VALID JSON matching the schema.`;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            rivalActions: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  rivalId: { type: Type.STRING },
                  action: { type: Type.STRING },
                  target: { type: Type.STRING },
                  reasoning: { type: Type.STRING }
                }
              }
            },
            emotionalUpdates: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  rivalId: { type: Type.STRING },
                  newState: { type: Type.STRING },
                  intensityChange: { type: Type.NUMBER }
                }
              }
            },
            bountyResponses: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  bountyId: { type: Type.STRING },
                  rivalId: { type: Type.STRING },
                  decision: { type: Type.STRING }
                }
              }
            },
            commentary: { 
              type: Type.OBJECT,
              properties: {
                speaker: { type: Type.STRING },
                text: { type: Type.STRING }
              }
            },
            policeAction: {
              type: Type.OBJECT,
              properties: {
                active: { type: Type.BOOLEAN },
                target: { type: Type.STRING },
                description: { type: Type.STRING }
              }
            },
            positionChanges: {
              type: Type.ARRAY,
              items: { type: Type.STRING }
            }
          }
        }
      }
    });

    // Access the extracted text output using the .text property.
    return JSON.parse(response.text || '{}');
  } catch (error) {
    console.error("AI Decision Engine Error:", error);
    return null;
  }
};

// Fix: Updated rivals parameter type to Opponent[].
export const generateRaceRecap = async (
  player: Player,
  rivals: Opponent[],
  raceState: RaceState
) => {
  const prompt = `Generate a cinematic 'After Action Report' for NEURAL RUSH.
  
  FINAL RESULTS:
  - 1st to 5th: ${raceState.positions.join(", ")}
  - Total Lap Time: 2:45.32 (Simulated)
  - Heat Level Final: ${raceState.heatLevel}
  
  Write this as a mix of underground news, social media posts, and personal rival messages.
  Focus on any "betrayals" or "bounties" that happened.
  
  Output JSON format. Ensure high-quality, edgy writing.`;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-pro-preview",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            headline: { type: Type.STRING },
            summary: { type: Type.STRING },
            eventHighlights: { type: Type.ARRAY, items: { type: Type.STRING } },
            rivalQuotes: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  rivalId: { type: Type.STRING },
                  quote: { type: Type.STRING },
                  mood: { type: Type.STRING }
                }
              }
            },
            forumBuzz: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  user: { type: Type.STRING },
                  text: { type: Type.STRING },
                  upvotes: { type: Type.NUMBER }
                }
              }
            }
          }
        }
      }
    });
    // Access the extracted text output using the .text property.
    return JSON.parse(response.text || '{}');
  } catch (error) {
    console.error("Recap Generation Error:", error);
    return null;
  }
};
