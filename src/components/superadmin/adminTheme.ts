export type AdminThemeMode = 'light' | 'dark';

export interface AdminPalette {
  pageBg: string;
  sidebarBg: string;
  sidebarBorder: string;
  sidebarActiveItem: string;
  sidebarIdleItem: string;
  topbarBg: string;
  cardBg: string;
  cardMutedBg: string;
  cardBorder: string;
  textPrimary: string;
  textSecondary: string;
  textMuted: string;
  inputBg: string;
  tableHeaderBg: string;
  tableRowHover: string;
  tableDivider: string;
  accentGoldText: string;
  accentGoldBadge: string;
  primaryBtn: string;
  secondaryBtn: string;
  modalBg: string;
}

export function getAdminPalette(theme: AdminThemeMode): AdminPalette {
  if (theme === 'dark') {
    return {
      pageBg: 'bg-[#071426] text-slate-100',
      sidebarBg: 'bg-[#0B1F3A]',
      sidebarBorder: 'border-[#1B355B]',
      sidebarActiveItem: 'bg-[#C8A24A] text-[#071426] shadow-sm',
      sidebarIdleItem: 'text-slate-300 hover:bg-[#132B4D] hover:text-white',
      topbarBg: 'bg-[#0B1F3A]/95 border-[#1B355B]',
      cardBg: 'bg-[#0D223D]',
      cardMutedBg: 'bg-[#122B4D]',
      cardBorder: 'border-[#1E3A5F]',
      textPrimary: 'text-white',
      textSecondary: 'text-slate-300',
      textMuted: 'text-slate-400',
      inputBg: 'bg-[#091A30] border-[#25456E] text-white placeholder:text-slate-400',
      tableHeaderBg: 'bg-[#091A30] text-slate-300 border-[#1E3A5F]',
      tableRowHover: 'hover:bg-[#132B4D]/70',
      tableDivider: 'divide-[#1B355B]',
      accentGoldText: 'text-[#E5C168]',
      accentGoldBadge: 'bg-[#C8A24A]/15 text-[#E5C168] border-[#C8A24A]/40',
      primaryBtn: 'bg-[#0284C7] hover:bg-[#0369A1] text-white',
      secondaryBtn: 'bg-[#132B4D] hover:bg-[#1B3A66] text-slate-100 border border-[#25456E]',
      modalBg: 'bg-[#0D223D] border-[#25456E] text-white',
    };
  }

  return {
    pageBg: 'bg-[#F5F7FA] text-[#0B1F3A]',
    sidebarBg: 'bg-[#0B1F3A]',
    sidebarBorder: 'border-[#163156]',
    sidebarActiveItem: 'bg-[#C8A24A] text-[#0B1F3A] shadow-sm',
    sidebarIdleItem: 'text-slate-200 hover:bg-white/10 hover:text-white',
    topbarBg: 'bg-white/95 border-[#D9E2EC]',
    cardBg: 'bg-white',
    cardMutedBg: 'bg-[#F8FAFC]',
    cardBorder: 'border-[#D9E2EC]',
    textPrimary: 'text-[#0B1F3A]',
    textSecondary: 'text-[#334E68]',
    textMuted: 'text-[#627D98]',
    inputBg: 'bg-white border-[#CBD5E1] text-[#0B1F3A] placeholder:text-[#829AB1]',
    tableHeaderBg: 'bg-[#F0F4F8] text-[#486581] border-[#D9E2EC]',
    tableRowHover: 'hover:bg-[#F8FAFC]',
    tableDivider: 'divide-[#E6ECF2]',
    accentGoldText: 'text-[#9E7B22]',
    accentGoldBadge: 'bg-[#FBF6E8] text-[#8C6D1F] border-[#E6D08F]',
    primaryBtn: 'bg-[#0B1F3A] hover:bg-[#14335D] text-white',
    secondaryBtn: 'bg-[#F0F4F8] hover:bg-[#E2E8F0] text-[#0B1F3A] border border-[#D9E2EC]',
    modalBg: 'bg-white border-[#D9E2EC] text-[#0B1F3A]',
  };
}
