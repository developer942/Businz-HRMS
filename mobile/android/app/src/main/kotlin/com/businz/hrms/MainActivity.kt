package com.businz.hrms

import android.app.Activity
import android.content.ActivityNotFoundException
import android.content.ContentValues
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.Environment
import android.provider.MediaStore
import android.provider.OpenableColumns
import androidx.core.content.FileProvider
import io.flutter.embedding.android.FlutterActivity
import io.flutter.embedding.engine.FlutterEngine
import io.flutter.plugin.common.MethodChannel
import java.io.File
import java.io.FileOutputStream

class MainActivity : FlutterActivity() {
    companion object {
        private const val DOCUMENT_PICKER_CHANNEL = "com.businz.hrms/document_picker"
        private const val REQUEST_CODE_PICK_DOCUMENT = 9421
    }

    private var pendingPickerResult: MethodChannel.Result? = null

    override fun configureFlutterEngine(flutterEngine: FlutterEngine) {
        super.configureFlutterEngine(flutterEngine)
        MethodChannel(
            flutterEngine.dartExecutor.binaryMessenger,
            DOCUMENT_PICKER_CHANNEL
        ).setMethodCallHandler { call, result ->
            when (call.method) {
                "pickDocument" -> {
                    if (pendingPickerResult != null) {
                        result.error("ALREADY_ACTIVE", "A file picker is already open.", null)
                        return@setMethodCallHandler
                    }
                    val mimeTypes = call.argument<List<String>>("mimeTypes") ?: listOf("*/*")
                    val intent = Intent(Intent.ACTION_OPEN_DOCUMENT).apply {
                        addCategory(Intent.CATEGORY_OPENABLE)
                        if (mimeTypes.size == 1) {
                            type = mimeTypes[0]
                        } else {
                            type = "*/*"
                            putExtra(Intent.EXTRA_MIME_TYPES, mimeTypes.toTypedArray())
                        }
                        addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
                    }
                    pendingPickerResult = result
                    try {
                        startActivityForResult(intent, REQUEST_CODE_PICK_DOCUMENT)
                    } catch (e: Exception) {
                        pendingPickerResult = null
                        result.error("PICKER_ERROR", e.localizedMessage ?: "Unable to open file picker.", null)
                    }
                }
                "shareFile" -> {
                    val fileName = call.argument<String>("fileName") ?: "report.xls"
                    val mimeType = call.argument<String>("mimeType") ?: "application/octet-stream"
                    val bytes = call.argument<ByteArray>("bytes")
                    if (bytes == null) {
                        result.error("INVALID_ARGS", "Missing file bytes to share.", null)
                        return@setMethodCallHandler
                    }
                    try {
                        val outFile = writeExportCacheFile(fileName, bytes)
                        val uri = FileProvider.getUriForFile(
                            this,
                            "${packageName}.businz.fileprovider",
                            outFile
                        )
                        val shareIntent = Intent(Intent.ACTION_SEND).apply {
                            type = mimeType
                            putExtra(Intent.EXTRA_STREAM, uri)
                            putExtra(Intent.EXTRA_SUBJECT, outFile.name)
                            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
                        }
                        startActivity(Intent.createChooser(shareIntent, "Share ${outFile.name}"))
                        result.success(outFile.absolutePath)
                    } catch (e: Exception) {
                        result.error("SHARE_ERROR", e.localizedMessage ?: "Failed to export file.", null)
                    }
                }
                "saveToDownloads" -> {
                    val fileName = call.argument<String>("fileName") ?: "attachment"
                    val mimeType = call.argument<String>("mimeType") ?: "application/octet-stream"
                    val bytes = call.argument<ByteArray>("bytes")
                    if (bytes == null) {
                        result.error("INVALID_ARGS", "Missing file bytes to save.", null)
                        return@setMethodCallHandler
                    }
                    Thread {
                        try {
                            val savedLocation = saveBytesToDownloads(fileName, mimeType, bytes)
                            runOnUiThread { result.success(savedLocation) }
                        } catch (e: Exception) {
                            runOnUiThread {
                                result.error("SAVE_ERROR", e.localizedMessage ?: "Failed to save file to Downloads.", null)
                            }
                        }
                    }.start()
                }
                "openFile" -> {
                    val fileName = call.argument<String>("fileName") ?: "attachment"
                    val mimeType = call.argument<String>("mimeType") ?: "application/octet-stream"
                    val bytes = call.argument<ByteArray>("bytes")
                    if (bytes == null) {
                        result.error("INVALID_ARGS", "Missing file bytes to open.", null)
                        return@setMethodCallHandler
                    }
                    try {
                        val outFile = writeExportCacheFile(fileName, bytes)
                        val uri = FileProvider.getUriForFile(
                            this,
                            "${packageName}.businz.fileprovider",
                            outFile
                        )
                        val viewIntent = Intent(Intent.ACTION_VIEW).apply {
                            setDataAndType(uri, mimeType)
                            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
                        }
                        try {
                            startActivity(viewIntent)
                        } catch (_: ActivityNotFoundException) {
                            val shareIntent = Intent(Intent.ACTION_SEND).apply {
                                type = mimeType
                                putExtra(Intent.EXTRA_STREAM, uri)
                                putExtra(Intent.EXTRA_SUBJECT, outFile.name)
                                addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
                            }
                            startActivity(Intent.createChooser(shareIntent, "Open ${outFile.name}"))
                        }
                        result.success(outFile.absolutePath)
                    } catch (e: Exception) {
                        result.error("OPEN_ERROR", e.localizedMessage ?: "Failed to open file.", null)
                    }
                }
                else -> result.notImplemented()
            }
        }
    }

    @Deprecated("Deprecated in Java")
    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        if (requestCode == REQUEST_CODE_PICK_DOCUMENT) {
            val result = pendingPickerResult
            pendingPickerResult = null
            if (result == null) return
            if (resultCode != Activity.RESULT_OK || data?.data == null) {
                result.success(null)
                return
            }
            val uri: Uri = data.data!!
            Thread {
                try {
                    val displayName = resolveDisplayName(uri)
                    val safeName = displayName.replace(Regex("[^a-zA-Z0-9._-]"), "_")
                    val cacheFile = File(cacheDir, "wa_pick_${System.currentTimeMillis()}_$safeName")
                    contentResolver.openInputStream(uri)?.use { input ->
                        FileOutputStream(cacheFile).use { output ->
                            input.copyTo(output)
                        }
                    } ?: throw IllegalStateException("Could not open selected file.")

                    val payload = mapOf(
                        "path" to cacheFile.absolutePath,
                        "name" to displayName,
                        "size" to cacheFile.length()
                    )
                    runOnUiThread { result.success(payload) }
                } catch (e: Exception) {
                    runOnUiThread {
                        result.error("READ_ERROR", e.localizedMessage ?: "Failed to read selected file.", null)
                    }
                }
            }.start()
            return
        }
        super.onActivityResult(requestCode, resultCode, data)
    }

    private fun sanitizeFileName(raw: String): String {
        val cleaned = raw.trim().replace(Regex("[^a-zA-Z0-9._-]"), "_")
        return if (cleaned.isBlank() || cleaned == "." || cleaned == "..") "attachment" else cleaned
    }

    private fun writeExportCacheFile(fileName: String, bytes: ByteArray): File {
        val safeName = sanitizeFileName(fileName)
        val exportDir = File(cacheDir, "exports").apply { mkdirs() }
        val outFile = File(exportDir, safeName)
        FileOutputStream(outFile).use { it.write(bytes) }
        return outFile
    }

    private fun saveBytesToDownloads(fileName: String, mimeType: String, bytes: ByteArray): String {
        val safeName = sanitizeFileName(fileName)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            val values = ContentValues().apply {
                put(MediaStore.MediaColumns.DISPLAY_NAME, safeName)
                put(MediaStore.MediaColumns.MIME_TYPE, mimeType)
                put(MediaStore.MediaColumns.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS)
                put(MediaStore.MediaColumns.IS_PENDING, 1)
            }
            val resolver = contentResolver
            val uri = resolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values)
                ?: throw IllegalStateException("Could not create Downloads entry.")
            try {
                resolver.openOutputStream(uri)?.use { out ->
                    out.write(bytes)
                    out.flush()
                } ?: throw IllegalStateException("Could not open Downloads output stream.")
                val doneValues = ContentValues().apply {
                    put(MediaStore.MediaColumns.IS_PENDING, 0)
                }
                resolver.update(uri, doneValues, null, null)
                return "Downloads/$safeName"
            } catch (e: Exception) {
                resolver.delete(uri, null, null)
                throw e
            }
        }

        @Suppress("DEPRECATION")
        val targetDir = try {
            val pubDir = Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS)
            if (pubDir != null && (pubDir.exists() || pubDir.mkdirs()) && pubDir.canWrite()) {
                pubDir
            } else {
                getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS) ?: File(cacheDir, "exports").apply { mkdirs() }
            }
        } catch (_: SecurityException) {
            getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS) ?: File(cacheDir, "exports").apply { mkdirs() }
        }
        val outFile = File(targetDir, safeName)
        FileOutputStream(outFile).use { it.write(bytes) }
        return outFile.absolutePath
    }

    private fun resolveDisplayName(uri: Uri): String {
        try {
            contentResolver.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME), null, null, null)?.use { cursor ->
                if (cursor.moveToFirst()) {
                    val idx = cursor.getColumnIndex(OpenableColumns.DISPLAY_NAME)
                    if (idx >= 0) {
                        val name = cursor.getString(idx)
                        if (!name.isNullOrBlank()) return name
                    }
                }
            }
        } catch (_: Exception) {
        }
        return uri.lastPathSegment?.substringAfterLast('/') ?: "selected_file"
    }
}
