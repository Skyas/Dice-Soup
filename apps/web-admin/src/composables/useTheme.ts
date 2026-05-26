import { ref, computed, watch } from 'vue'
import { darkTheme } from 'naive-ui'
import type { GlobalThemeOverrides } from 'naive-ui'

type ThemeMode = 'dark' | 'parchment'

const theme = ref<ThemeMode>(
  (localStorage.getItem('ds-theme') as ThemeMode) ?? 'dark',
)

// Apply data-theme to <html> on init
document.documentElement.setAttribute(
  'data-theme',
  theme.value === 'dark' ? 'dark' : 'light',
)

watch(theme, (val) => {
  localStorage.setItem('ds-theme', val)
  document.documentElement.setAttribute('data-theme', val === 'dark' ? 'dark' : 'light')
})

const darkOverrides: GlobalThemeOverrides = {
  common: {
    primaryColor:         '#C7A35F',
    primaryColorHover:    '#E0BC75',
    primaryColorPressed:  '#8B7240',
    primaryColorSuppl:    '#C7A35F',
    bodyColor:            '#0E0A14',
    cardColor:            '#1A1525',
    modalColor:           '#1A1525',
    popoverColor:         '#221B2F',
    tableColor:           '#1A1525',
    tableHeaderColor:     '#221B2F',
    inputColor:           '#221B2F',
    inputColorDisabled:   '#1A1525',
    borderColor:          'rgba(247, 235, 207, 0.07)',
    dividerColor:         'rgba(247, 235, 207, 0.07)',
    textColorBase:        '#F5EFE0',
    textColor1:           '#F5EFE0',
    textColor2:           '#B3A993',
    textColor3:           '#6E6580',
    placeholderColor:     '#6E6580',
    scrollbarColor:       'rgba(247, 235, 207, 0.14)',
    scrollbarColorHover:  '#8B7240',
    tagColor:             '#221B2F',
    successColor:         '#7AAE5C',
    warningColor:         '#E0A847',
    errorColor:           '#D4574F',
    infoColor:            '#7895C2',
    fontFamily:           '"IBM Plex Sans", "Noto Sans SC", system-ui, sans-serif',
    fontFamilyMono:       '"JetBrains Mono", ui-monospace, Menlo, monospace',
    borderRadius:         '6px',
  },
  Button:    { textColorPrimary: '#1A1525' },
  Menu: {
    itemColorActive:        'rgba(199, 163, 95, 0.12)',
    itemColorActiveHover:   'rgba(199, 163, 95, 0.18)',
    itemTextColorActive:    '#F5EFE0',
    itemIconColorActive:    '#C7A35F',
    itemColorHover:         '#2B2339',
    borderRadius:           '6px',
  },
  DataTable: {
    thColor:      '#221B2F',
    tdColor:      '#1A1525',
    tdColorHover: '#2B2339',
    borderColor:  'rgba(247, 235, 207, 0.07)',
  },
  Tag:  { color: '#221B2F', borderRadius: '4px' },
}

const parchmentOverrides: GlobalThemeOverrides = {
  common: {
    primaryColor:         '#7A2E1F',
    primaryColorHover:    '#9A3A28',
    primaryColorPressed:  '#5A2316',
    primaryColorSuppl:    '#7A2E1F',
    bodyColor:            '#EFE5CC',
    cardColor:            '#FBF3DC',
    modalColor:           '#FBF3DC',
    popoverColor:         '#FFF8E5',
    tableColor:           '#FBF3DC',
    tableHeaderColor:     '#EFE5CC',
    inputColor:           '#FFF8E5',
    inputColorDisabled:   '#F5ECD5',
    borderColor:          'rgba(60, 38, 18, 0.10)',
    dividerColor:         'rgba(60, 38, 18, 0.10)',
    textColorBase:        '#2A1C0F',
    textColor1:           '#2A1C0F',
    textColor2:           '#4F3D27',
    textColor3:           '#7A6849',
    placeholderColor:     '#7A6849',
    scrollbarColor:       'rgba(60, 38, 18, 0.15)',
    scrollbarColorHover:  '#5A2316',
    tagColor:             '#EFE5CC',
    successColor:         '#4F6B2A',
    warningColor:         '#B07A19',
    errorColor:           '#9A2B22',
    infoColor:            '#2F5780',
    fontFamily:           '"IBM Plex Sans", "Noto Sans SC", system-ui, sans-serif',
    fontFamilyMono:       '"JetBrains Mono", ui-monospace, Menlo, monospace',
    borderRadius:         '6px',
  },
  Button:    { textColorPrimary: '#FBF3DC' },
  Menu: {
    itemColorActive:        'rgba(122, 46, 31, 0.10)',
    itemColorActiveHover:   'rgba(122, 46, 31, 0.16)',
    itemTextColorActive:    '#2A1C0F',
    itemColorHover:         '#EADFC0',
    borderRadius:           '6px',
  },
  DataTable: {
    thColor:      '#EFE5CC',
    tdColor:      '#FBF3DC',
    tdColorHover: '#EADFC0',
    borderColor:  'rgba(60, 38, 18, 0.10)',
  },
  Tag:  { color: '#EFE5CC', borderRadius: '4px' },
}

export function useTheme() {
  const isDark = computed(() => theme.value === 'dark')
  const naiveTheme = computed(() => isDark.value ? darkTheme : null)
  const themeOverrides = computed<GlobalThemeOverrides>(() =>
    isDark.value ? darkOverrides : parchmentOverrides,
  )

  function toggle() {
    theme.value = theme.value === 'dark' ? 'parchment' : 'dark'
  }

  return { theme, isDark, naiveTheme, themeOverrides, toggle }
}
