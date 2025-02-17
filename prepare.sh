# Clean and reinstall
rm -rf node_modules/ package-lock.json
npm install

# Now rebuild
npm run build
