export default function featuredProjects() {
    return {
        activeIndex: 0,
        selectProject(index) {
            this.activeIndex = index;
        },
    };
}
