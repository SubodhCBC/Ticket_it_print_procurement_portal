import { useAppDispatch, useAppSelector } from '@/store/hooks'
import {
  toggleMobileDrawer,
  closeMobileDrawer,
  openMobileDrawer,
  toggleMiniSidebar,
  setIsMiniSidebar,
  setWindowWidth,
} from '@/store/sidebarSlice'

export const useSidebar = () => {
  const dispatch = useAppDispatch()
  const { isMobileOpen, isMiniSidebar, windowWidth } = useAppSelector(
    (state) => state.sidebar
  )

  const isMobile = windowWidth < 768
  const isTablet = windowWidth >= 768 && windowWidth < 1024
  const isDesktop = windowWidth >= 1024

  return {
    isMobileOpen,
    isMiniSidebar,
    isMobile,
    isTablet,
    isDesktop,
    toggleMobileDrawer: () => dispatch(toggleMobileDrawer()),
    closeMobileDrawer: () => dispatch(closeMobileDrawer()),
    openMobileDrawer: () => dispatch(openMobileDrawer()),
    toggleMiniSidebar: () => dispatch(toggleMiniSidebar()),
    setIsMiniSidebar: (val: boolean) => dispatch(setIsMiniSidebar(val)),
    setWindowWidth: (val: number) => dispatch(setWindowWidth(val)),
  }
}
