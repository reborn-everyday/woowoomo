import { Menu, type MenuItemConstructorOptions, Tray, app, nativeImage } from 'electron'

import type { Scheduler } from './scheduler'

export interface AppTrayController {
  readonly tray: Tray
  destroy(): void
  refreshMenu(): void
}

export interface CreateAppTrayOptions {
  scheduler: Scheduler
  openMainWindow: () => void
}

const TRAY_TOOLTIP = 'Woowoomo'

const TRAY_ICON_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAQAAAC1+jfqAAAAJElEQVR4AWNABf9hYGBg+M+AFeBjYGBQwBhk2M2A4qjA4AAAT8kD9Ps6hW8AAAAASUVORK5CYII='

function createTrayIcon() {
  const icon = nativeImage.createFromBuffer(Buffer.from(TRAY_ICON_PNG_BASE64, 'base64'))

  if (process.platform === 'darwin') {
    icon.setTemplateImage(true)
  }

  return icon
}

export function createAppTray(options: CreateAppTrayOptions): AppTrayController {
  const tray = new Tray(createTrayIcon())
  tray.setToolTip(TRAY_TOOLTIP)

  function buildMenuTemplate(): MenuItemConstructorOptions[] {
    const isCollecting = options.scheduler.getState() === 'running'

    return [
      {
        label: 'Open WooWoomo',
        click: () => {
          options.openMainWindow()
        }
      },
      { type: 'separator' },
      {
        label: 'Start Collection',
        enabled: !isCollecting,
        click: () => {
          void options.scheduler.start().finally(() => {
            refreshMenu()
          })
        }
      },
      {
        label: 'Stop Collection',
        enabled: isCollecting,
        click: () => {
          void options.scheduler.stop().finally(() => {
            refreshMenu()
          })
        }
      },
      { type: 'separator' },
      {
        label: 'Quit',
        click: () => {
          app.quit()
        }
      }
    ]
  }

  function refreshMenu(): void {
    tray.setContextMenu(Menu.buildFromTemplate(buildMenuTemplate()))
  }

  tray.on('click', () => {
    options.openMainWindow()
  })
  tray.on('right-click', () => {
    refreshMenu()
  })

  refreshMenu()

  return {
    tray,
    destroy: () => {
      tray.destroy()
    },
    refreshMenu
  }
}
