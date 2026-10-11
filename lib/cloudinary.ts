import { v2 as cloudinary } from 'cloudinary'
import type { UploadApiResponse } from 'cloudinary'

export type StoredPhoto = {
  photoId: string
  publicId: string
  format: string
  contentType: string
}

function configuredCloudinary() {
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME
  const apiKey = process.env.CLOUDINARY_API_KEY
  const apiSecret = process.env.CLOUDINARY_API_SECRET
  if (!cloudName || !apiKey || !apiSecret) {
    throw new Error('Photo storage is not configured. Set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET.')
  }
  cloudinary.config({ cloud_name: cloudName, api_key: apiKey, api_secret: apiSecret, secure: true })
  return cloudinary
}

export async function uploadPrivatePhoto(file: File, photoId: string, publicId: string): Promise<StoredPhoto> {
  const client = configuredCloudinary()
  const bytes = Buffer.from(await file.arrayBuffer())
  const result = await new Promise<UploadApiResponse>((resolve, reject) => {
    const stream = client.uploader.upload_stream({
      public_id: publicId,
      resource_type: 'image',
      type: 'authenticated',
      overwrite: false,
      unique_filename: false,
      use_filename: false,
      context: { photo_id: photoId },
    }, (error, response) => {
      if (error) reject(error)
      else if (response) resolve(response)
      else reject(new Error('Cloudinary returned no upload result.'))
    })
    stream.end(bytes)
  })
  return { photoId, publicId: result.public_id, format: result.format, contentType: file.type }
}

export async function deletePrivatePhoto(publicId: string) {
  const result = await configuredCloudinary().uploader.destroy(publicId, {
    resource_type: 'image',
    type: 'authenticated',
    invalidate: true,
  })
  if (result.result !== 'ok' && result.result !== 'not found') {
    throw new Error('Cloudinary did not confirm photo cleanup.')
  }
}

export function privatePhotoDownloadUrl(photo: Pick<StoredPhoto, 'publicId' | 'format'>) {
  return configuredCloudinary().utils.private_download_url(photo.publicId, photo.format, {
    resource_type: 'image',
    type: 'authenticated',
    expires_at: Math.floor(Date.now() / 1000) + 60,
  })
}
