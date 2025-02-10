# Secure Browser Wrapper (Electron)

A security-enhanced fork of the Google Gemini desktop client using the Electron framework. This version includes significant security improvements and better application behavior.

## Security Features

- Content Security Policy (CSP) implementation
- Enhanced webview security settings
- Sandboxed webview environment
- Disabled popup windows
- Proper context isolation
- No web security bypasses

## Application Features

- Single instance lock mechanism (prevents multiple instances)
- Automatic window focusing
- System tray integration
- Always-on-top option
- Show on startup option

## Installation

For Windows and macOS users, precompiled versions are available in the releases section.

For other systems or development:

1. Clone the repository
2. Install dependencies:
   ```bash
   npm install
   ```
3. Run the application:
   ```bash
   npm start
   ```
4. Build for your platform:
   ```bash
   npm run build
   ```

## Development

This client operates by utilizing a WebView container to access the Gemini website and implements various modifications for enhanced security and user experience.

### Security Considerations

- The webview is sandboxed and has strict security settings
- Content Security Policy restricts resource loading
- Node integration is disabled
- Context isolation is enabled
- Web security cannot be disabled


## Contributing

Contributions are welcome! Please ensure you maintain the security standards when submitting pull requests.

## License

ISC License


