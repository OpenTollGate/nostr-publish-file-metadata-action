# Clean
rm -rf node_modules
rm -rf dist
rm package-lock.json

# Reinstall
npm install

# Now rebuild
npm run build
