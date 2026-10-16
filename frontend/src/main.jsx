import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import PlanApp from './plan/PlanApp.jsx'
import Room from './plan/Room.jsx'

// #room is the instructor's room chart.
const route = window.location.hash.replace('#', '')
const Root = route === 'room' ? Room : PlanApp

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <Root />
  </StrictMode>,
)
