import { GoogleGenAI } from "@google/genai";
import { GameStats } from "../types";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || '' });

// Briefing model configuration
const briefingModel = 'gemini-2.5-flash';
// Debriefing model configuration
const debriefModel = 'gemini-2.5-flash';

export const generateBriefing = async (): Promise<string> => {
  try {
    const response = await ai.models.generateContent({
      model: briefingModel,
      contents: "Generate a very short (max 2 sentences), intense, cyberpunk-style mission briefing for an aim training simulation. Use slang like 'choom', 'netrunner', 'glitch'. Do not use markdown.",
    });
    return response.text.trim();
  } catch (error) {
    console.error("Gemini briefing error:", error);
    return "SYSTEM OVERRIDE. TARGET PRACTICE INITIATED. DESTROY ALL ARTIFACTS.";
  }
};

export const generateDebrief = async (stats: GameStats): Promise<string> => {
  try {
    const accuracy = stats.enemiesSpawned > 0 
      ? Math.round((stats.enemiesDestroyed / stats.enemiesSpawned) * 100) 
      : 0;

    const prompt = `
      You are a harsh, cynical cyberpunk drill instructor. 
      Analyze these training stats:
      Score: ${stats.score}
      Targets Destroyed: ${stats.enemiesDestroyed}/${stats.enemiesSpawned}
      Headshots: ${stats.headshots}
      Bodyshots: ${stats.bodyshots}
      Efficiency: ${accuracy}%

      Give a short (max 40 words) assessment. 
      If the score is high (>30), be begrudgingly impressed. 
      If low, be mocking. Use cyberpunk slang.
    `;

    const response = await ai.models.generateContent({
      model: debriefModel,
      contents: prompt,
    });
    return response.text.trim();
  } catch (error) {
    console.error("Gemini debrief error:", error);
    return "CONNECTION LOST. UPLOAD COMPLETED. PERFORMANCE: ADEQUATE.";
  }
};
