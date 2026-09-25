import { configureStore } from '@reduxjs/toolkit'
import sidebarReducer from './sidebarSlice'
import authReducer from './authSlice'
import cartReducer from './cartSlice'

export const store = configureStore({
  reducer: {
    sidebar: sidebarReducer,
    auth: authReducer,
    cart: cartReducer,
  },
})

export type RootState = ReturnType<typeof store.getState>
export type AppDispatch = typeof store.dispatch
