/**
 * Founders. Edit this list to change the portrait, bio, and links.
 * Leave photo as "" to keep the initials monogram.
 */
export const FOUNDERS = [
  {
    name: "Ryan Phua",
    title: "Founder",
    initials: "RP",
    photo: "",
    bio: "Early career software engineer specialising in cloud migration of CI/CD automation. Led end-to-end migration of SaaS delivery stack from AWS Amplify V1 to V2, built an air-gapped Kubernetes cluster customised for on-satellite ML workloads for image segmentation tasks in Pytorch & Tensorflow. Anubys is my portfolio product aimed at delivering scalable, cost-efficient & effective AI model infrastructure to guarantee accountable, reproducible, and retraceable ML workflows for enterprise-scale tooling and/or individual hobbyists.",
    github: "https://github.com/ryean0",
    linkedin: "https://www.linkedin.com/in/rphua-dev",
  },
];

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

export function founderContact(person) {
  return person.linkedin;
}

export function renderFounderCard(person) {
  const avatar = person.photo
    ? `<img class="founder-avatar" src="${escapeHtml(person.photo)}" alt="">`
    : `<span class="founder-avatar" aria-hidden="true">${escapeHtml(person.initials)}</span>`;
  return `<li class="founder-card">${avatar}<div class="founder-copy"><h3 class="founder-name">${escapeHtml(person.name)}</h3><p class="founder-role">${escapeHtml(person.title)}</p><p class="founder-bio">${escapeHtml(person.bio)}</p><p class="founder-links"><a href="${escapeHtml(person.github)}" rel="noopener noreferrer">GitHub</a><a href="${escapeHtml(person.linkedin)}" rel="noopener noreferrer">LinkedIn</a></p></div></li>`;
}

export function renderFoundersHtml(people = FOUNDERS) {
  return people.map((person) => renderFounderCard(person)).join("");
}
