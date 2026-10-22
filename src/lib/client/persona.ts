// Fictional demo personas. Each gets its own colour so a viewer can tell, at a glance, which
// browser profile is on screen. Colour is presentation only: it grants nothing.
export interface Persona {
  name: string;
  title: string;
  color: string;
}

const PERSONAS: Record<string, Persona> = {
  linh: { name: "Linh", title: "Question setter", color: "#8b5cf6" },
  minh: { name: "Minh", title: "Ministry representative", color: "#e0453a" },
  hoa: { name: "Hoa", title: "Provincial council chair", color: "#14a38b" },
  tuan: { name: "Tuấn", title: "Exam site head", color: "#3b82f6" },
  nam: { name: "Nam", title: "Proctor, Site A Room 12", color: "#f97316" },
  quang: { name: "Quang", title: "IT operator", color: "#64748b" },
};

export function persona(username: string | null | undefined): Persona {
  const key = String(username ?? "").toLowerCase();
  return PERSONAS[key] ?? { name: username || "Unknown", title: "", color: "#94a3b8" };
}
