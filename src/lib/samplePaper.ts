// SYNTHETIC sample questions, written for this demo. Not from any real exam.
// This file is the setter's draft. It is encrypted in the setter's browser before anything is
// sent, so the server never holds it in plaintext.

export interface Question {
  text: string;
  options: [string, string, string, string];
  answer: "A" | "B" | "C" | "D";
}

export const SAMPLE_QUESTIONS: Question[] = [
  { text: "What is 12 × 8?", options: ["86", "96", "104", "92"], answer: "B" },
  { text: "Solve for x: 3x + 5 = 20.", options: ["3", "4", "5", "6"], answer: "C" },
  { text: "What is the derivative of x²?", options: ["x", "2x", "x²/2", "2"], answer: "B" },
  { text: "A triangle has angles 50° and 60°. What is the third angle?", options: ["60°", "70°", "80°", "90°"], answer: "B" },
  { text: "What is log₁₀(1000)?", options: ["2", "3", "10", "100"], answer: "B" },
  { text: "What is the area of a circle with radius 3?", options: ["6π", "9π", "3π", "12π"], answer: "B" },
  { text: "Which number is prime?", options: ["21", "27", "29", "33"], answer: "C" },
  { text: "What is 15% of 200?", options: ["15", "20", "30", "35"], answer: "C" },
  { text: "What is the sum of the interior angles of a quadrilateral?", options: ["180°", "270°", "360°", "540°"], answer: "C" },
  { text: "If f(x) = 2x − 1, what is f(4)?", options: ["5", "6", "7", "8"], answer: "C" },
];
