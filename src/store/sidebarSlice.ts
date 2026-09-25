import { createSlice, PayloadAction } from '@reduxjs/toolkit'

interface SidebarState {
  isMobileOpen: boolean
  isMiniSidebar: boolean
  windowWidth: number
}

const initialState: SidebarState = {
  isMobileOpen: false,
  isMiniSidebar:
    typeof window !== 'undefined'
      ? localStorage.getItem('ticketit_sidebar_mini_preference') === 'true'
      : false,
  windowWidth: 1200,
}

const sidebarSlice = createSlice({
  name: 'sidebar',
  initialState,
  reducers: {
    toggleMobileDrawer: (state) => {
      state.isMobileOpen = !state.isMobileOpen
    },
    closeMobileDrawer: (state) => {
      state.isMobileOpen = false
    },
    openMobileDrawer: (state) => {
      state.isMobileOpen = true
    },
    toggleMiniSidebar: (state) => {
      state.isMiniSidebar = !state.isMiniSidebar
      if (typeof window !== 'undefined') {
        localStorage.setItem(
          'ticketit_sidebar_mini_preference',
          String(state.isMiniSidebar)
        )
      }
    },
    setIsMiniSidebar: (state, action: PayloadAction<boolean>) => {
      state.isMiniSidebar = action.payload
      if (typeof window !== 'undefined') {
        localStorage.setItem(
          'ticketit_sidebar_mini_preference',
          String(state.isMiniSidebar)
        )
      }
    },
    setWindowWidth: (state, action: PayloadAction<number>) => {
      state.windowWidth = action.payload
      if (action.payload < 1024 && action.payload >= 768) {
        state.isMiniSidebar = true
      } else if (action.payload >= 1024) {
        state.isMiniSidebar = false
      }
    },
  },
})

export const {
  toggleMobileDrawer,
  closeMobileDrawer,
  openMobileDrawer,
  toggleMiniSidebar,
  setIsMiniSidebar,
  setWindowWidth,
} = sidebarSlice.actions

export default sidebarSlice.reducer
