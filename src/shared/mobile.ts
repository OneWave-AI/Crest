export interface MobileProject { id: string; name: string; path: string }
export interface MobileDevice { id: string; name: string; createdAt: string }
export interface MobileStatus {
  enabled: boolean
  running: boolean
  url: string
  projects: MobileProject[]
  devices: MobileDevice[]
  error?: string
}
export interface MobilePairing { url: string; qrDataURL: string; expiresAt: string }
