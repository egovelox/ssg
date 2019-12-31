const fs = require('fs').promises;
const path = require('path');
const frontMatter = require('front-matter');
const remark = require('remark');
const remarkHTML = require('remark-html');
const remarkSlug = require('remark-slug');
const remarkHighlight = require('remark-highlight.js');
const nunjucks = require('nunjucks');

const postsDirPath = path.resolve(__dirname, 'posts');
const publicDirPath = path.resolve(__dirname, 'public');


const getFiles = async (dirPath, fileExt = '') => {

    const dirents = await fs.readdir(dirPath, { withFileTypes: true });

    return (
        dirents
        .filter(dirent => dirent.isFile())
        .filter(dirent =>
            fileExt.length ? dirent.name.toLowerCase().endsWith(fileExt) : true
            )
        .map(dirent => dirent.name)
    );
}

// Removing existing files (each time we launch the ssg)
const removeFiles = async (dirPath, fileExt) => {
    const fileNames = await getFiles(dirPath, fileExt);

    const filesToRemove = fileNames.map(fileName =>
            fs.unlink(path.resolve(dirPath, fileName))
    );
        return Promise.all(filesToRemove);
    }
;

const parsePost = (fileName, fileData) => {
    // remove the extension .md
    const slug = path.basename(fileName, '.md');

    const {attributes, body} = frontMatter(fileData);

    return {... attributes, body, slug};
};


const getPosts = async dirPath => {

    const fileNames = await getFiles(dirPath, '.md');

    const filesToRead = fileNames.map(
        fileName => 
        fs.readFile(path.resolve(dirPath, fileName), 'utf-8')
        );

    const fileData = await Promise.all(filesToRead);

    return fileNames.map((fileName, i) => parsePost(fileName, fileData[i]));
}

const markdownToHTML = text => 
    new Promise((resolve, reject) =>
    remark()
        .use(remarkHTML)
        .use(remarkSlug)
        .use(remarkHighlight)
        .process(text, (err, file) =>
        err ? reject(err) : resolve(file.contents)
        )
    )
;

// Helper function
const getTemplatePath = name => 
    path.resolve(__dirname, 'templates', path.format({name, ext: '.njk'}));



// Generate Post file, consuming the post object created by the parsePost() method.
const createPostFile = async post => {

    const fileData = nunjucks.render(
        getTemplatePath('post'),
        {
            ...post,
            body: await markdownToHTML(post.body)
        }

    );

    const fileName = path.format({name: post.slug, ext: '.html'});

    const filePath = path.resolve(publicDirPath, fileName);

    await fs.writeFile(filePath, fileData, 'utf-8');

    return post;

};


// Generate Index file
const createIndexFile = async posts => {
    const fileData = nunjucks.render(getTemplatePath('index'), {posts});
    const filePath = path.resolve(publicDirPath, 'index.html');

    await fs.writeFile(filePath, fileData, 'utf-8');
}




// build runs the ssr
const build = async () => {
    // ensure the public dir exists
    await fs.mkdir(publicDirPath, {recursive: true});
    // delete any previously generated HTML
    await removeFiles(publicDirPath, '.html');

    const posts = await getPosts(postsDirPath);

    const postsToCreate = posts
        .filter(post => Boolean(post.public))
        .map(post => createPostFile(post));

    const createdPosts = await Promise.all(postsToCreate);

    await createIndexFile(
        createdPosts.sort((a,b) => new Date(b.date) - new Date(a.date))
    );

    return createdPosts;
}

build()
.then(created =>
    console.log(`Build sucessful. Generated ${created.length} post(s).`))
.catch(err => console.log(err));


