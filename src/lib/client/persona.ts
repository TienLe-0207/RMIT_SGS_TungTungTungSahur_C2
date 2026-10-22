// Fictional demo personas. Each gets its own colour so a viewer can tell, at a glance, which
// browser profile is on screen. Colour is presentation only: it grants nothing.
export interface Persona {
  name: string;
  title: string;
  color: string;
}

const PERSONAS: Record<string, Persona> = {
  linh: { name: "Linh", title: "Question setter", color: "#4c2c92" },
  minh: { name: "Minh", title: "Ministry representative", color: "#942514" },
  hoa: { name: "Hoa", title: "Provincial council chair", color: "#005a30" },
  tuan: { name: "Tuấn", title: "Exam site head", color: "#1d70b8" },
  nam: { name: "Nam", title: "Proctor, Site A Room 12", color: "#a64b00" },
  quang: { name: "Quang", title: "IT operator", color: "#505a5f" },
};

export function persona(username: string | null | undefined): Persona {
  const key = String(username ?? "").toLowerCase();
  return PERSONAS[key] ?? { name: username || "Unknown", title: "", color: "#6f777b" };
}
