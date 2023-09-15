import fs from 'fs';
import axios from 'axios';

const writeContents = (contents, file) => {
  return new Promise(resolve => {
    const writeStream = fs.createWriteStream(file, { flags: 'w' });
    writeStream.write(contents.join('\n'));
    writeStream.close(() => resolve());
  });
};

export const appendSubject = async (subject, file = 'subjects.txt') => {
  if (!fs.existsSync(file)) {
    fs.writeFileSync(file, '');
  }

  const contents = fs.readFileSync(file).toString().split('\n').filter(Boolean);
  contents.push(subject);
  await writeContents(contents, file);
  return Promise.resolve();
};

export const deleteSubject = async (subject, file = 'subjects.txt') => {
  if (!fs.existsSync(file)) return Promise.resolve();

  const contents = fs.readFileSync(file).toString().split('\n').filter(Boolean);
  const subjectIndex = contents.findIndex(content => content === subject);
  if (subjectIndex > -1) {
    contents.splice(subjectIndex, 1);
    await writeContents(contents, file);
  }
  return Promise.resolve();
};

export const friendFetchUserInfo = user => {
  return axios
    .get('https://prod-api.kosetto.com/users/' + user)
    .then(res => {
      const userInfo = res.data || {};
      userInfo.valid = !!userInfo.id;
      return Promise.resolve(userInfo);
    })
    .catch(error => {
      return Promise.resolve({ valid: false });
    });
};
