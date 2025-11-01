# SecureBrowserWrapper

[![License: ISC](https://img.shields.io/badge/License-ISC-blue.svg)](https://opensource.org/licenses/ISC)

A security-focused Electron-based desktop client for accessing AI assistants including Google Gemini, Duck.ai, and Grok. Built with enhanced security features and optimized user experience.

## 🌟 Key Features

### 🔒 Security First
- **Enhanced WebView Security**:
  - Sandboxed environment with strict security policies
  - Content Security Policy (CSP) implementation
  - Context isolation enabled
  - Node integration disabled
  - Web security enforced
  - Proper permission handling

### 💻 Application Features
- **Multi-AI Support**:
  - Duck.ai
  - Perplexity
  - Grok
  - Google Gemini
- **Efficient Window Management**:
  - Single instance lock
  - System tray integration
  - Always-on-top option
  - Show on startup option
  - Automatic window focusing
- **Quick Navigation**:
  - Keyboard shortcuts for switching between AI services
  - Quick reload functionality
  - Status indicators for each service

### 🚀 Performance
- Smart memory management
- Background tab optimization
- Efficient resource handling
- Crash recovery system

## 🛠 Installation

### Pre-built Releases
Download the latest pre-compiled versions for Windows and macOS from the [releases section](https://github.com/apix7/SecureBrowserWrapper/releases).

### Build from Source
1. Clone the repository:
   ```bash
   git clone https://github.com/apix7/SecureBrowserWrapper.git
   cd SecureBrowserWrapper
   ```

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

## 🎮 Usage

### Keyboard Shortcuts
- `Ctrl/Cmd + G`: Launch the application
- `Ctrl/Cmd + 1`: Switch to Duck.ai
- `Ctrl/Cmd + 2`: Switch to Perplexity
- `Ctrl/Cmd + 3`: Switch to Grok
- `Ctrl/Cmd + 4`: Switch to Google Gemini

### Customization
- Configure startup behavior through the system tray menu
- Set window behavior (always-on-top, visibility)
- Custom keybindings available

## 🔧 Development

### Technical Architecture
- Built on Electron framework
- Implements secure WebView containers
- Modular component structure
- Comprehensive error handling
- Logging system for debugging

### Security Implementation
- URL allowlist system
- Strict CSP rules
- Controlled resource access
- Sanitized external links
- Protected WebView configuration

## 🤝 Contributing

Contributions are welcome! Please ensure you follow these guidelines:
1. Maintain security standards
2. Follow the existing code style
3. Add tests for new features
4. Update documentation as needed

## 🐛 Troubleshooting

If you encounter issues:
1. Check the application logs
2. Verify your internet connection
3. Ensure you're using the latest version
4. Try clearing the application cache

## 📝 License

This project is licensed under the ISC License.

## 🔍 Support

For support, please:
1. Check the [issues section](https://github.com/apix7/SecureBrowserWrapper/issues)
2. Review existing documentation
3. Open a new issue if needed

---

Made with ❤️ for secure AI interaction