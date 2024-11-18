import { socket } from '@/api/socket'

class SettingsService {
  updateUserSettings(data: Record<string, unknown>): void {
    socket.emit('user.settings.update', data)
  }

  setLastUsedDevice(value: string): void {
    this.updateUserSettings({ lastUsedDevice: value })
  }
}

export const settingsService = new SettingsService()
